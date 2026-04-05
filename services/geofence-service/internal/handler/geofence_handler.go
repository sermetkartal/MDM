package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
	"github.com/sermetkartal/mdm/services/geofence-service/internal/geo"
	"github.com/sermetkartal/mdm/services/geofence-service/internal/model"
	"github.com/sermetkartal/mdm/services/geofence-service/internal/repository"
	"google.golang.org/grpc"
)

type GeofenceHandler struct {
	repo *repository.GeofenceRepository
	nc   *nats.Conn
	rdb  *redis.Client
	sub  *nats.Subscription
}

func NewGeofenceHandler(repo *repository.GeofenceRepository, nc *nats.Conn, rdb *redis.Client) *GeofenceHandler {
	return &GeofenceHandler{repo: repo, nc: nc, rdb: rdb}
}

func (h *GeofenceHandler) RegisterGRPC(server *grpc.Server) {
	slog.Info("geofence handler registered")
}

// SubscribeTelemetry listens to device.telemetry NATS subject and processes location events.
func (h *GeofenceHandler) SubscribeTelemetry() error {
	if h.nc == nil {
		slog.Warn("NATS not connected, skipping telemetry subscription")
		return nil
	}

	var err error
	h.sub, err = h.nc.Subscribe("device.telemetry", func(msg *nats.Msg) {
		var tel model.TelemetryMessage
		if err := json.Unmarshal(msg.Data, &tel); err != nil {
			slog.Error("failed to unmarshal telemetry", "error", err)
			return
		}

		if tel.Latitude == 0 && tel.Longitude == 0 {
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		events, err := h.ProcessLocationEvent(ctx, tel.OrgID, tel.DeviceID, tel.Latitude, tel.Longitude)
		if err != nil {
			slog.Error("failed to process location event",
				"device_id", tel.DeviceID,
				"error", err,
			)
			return
		}

		if len(events) > 0 {
			slog.Debug("processed location event",
				"device_id", tel.DeviceID,
				"events", len(events),
			)
		}
	})
	if err != nil {
		return fmt.Errorf("subscribe device.telemetry: %w", err)
	}

	slog.Info("subscribed to device.telemetry")
	return nil
}

func (h *GeofenceHandler) Close() {
	if h.sub != nil {
		h.sub.Unsubscribe()
	}
}

// CreateGeofence validates and creates a new geofence.
func (h *GeofenceHandler) CreateGeofence(ctx context.Context, g *model.Geofence) error {
	if err := g.Validate(); err != nil {
		return fmt.Errorf("validation: %w", err)
	}

	if err := h.repo.Create(ctx, g); err != nil {
		return err
	}
	h.publishEvent("geofence.created", map[string]interface{}{
		"geofence_id": g.ID,
		"org_id":      g.OrgID,
		"type":        g.Type,
		"name":        g.Name,
	})
	return nil
}

// GetGeofence retrieves a geofence by ID.
func (h *GeofenceHandler) GetGeofence(ctx context.Context, id uuid.UUID) (*model.Geofence, error) {
	return h.repo.GetByID(ctx, id)
}

// ListGeofences returns all geofences for an org.
func (h *GeofenceHandler) ListGeofences(ctx context.Context, orgID uuid.UUID) ([]*model.Geofence, error) {
	return h.repo.ListByOrg(ctx, orgID)
}

// UpdateGeofence validates and updates a geofence.
func (h *GeofenceHandler) UpdateGeofence(ctx context.Context, g *model.Geofence) error {
	if err := g.Validate(); err != nil {
		return fmt.Errorf("validation: %w", err)
	}
	return h.repo.Update(ctx, g)
}

// DeleteGeofence removes a geofence and cleans up Redis state.
func (h *GeofenceHandler) DeleteGeofence(ctx context.Context, id uuid.UUID) error {
	if h.rdb != nil {
		pattern := fmt.Sprintf("geofence:*:%s", id.String())
		keys, err := h.rdb.Keys(ctx, pattern).Result()
		if err == nil && len(keys) > 0 {
			h.rdb.Del(ctx, keys...)
		}
	}
	return h.repo.Delete(ctx, id)
}

// ProcessLocationEvent evaluates a device location against all active geofences for the org,
// detects enter/exit/dwell transitions, and fires appropriate events.
func (h *GeofenceHandler) ProcessLocationEvent(ctx context.Context, orgID, deviceID uuid.UUID, lat, lng float64) ([]model.GeofenceEvent, error) {
	geofences, err := h.repo.ListActiveByOrg(ctx, orgID)
	if err != nil {
		return nil, err
	}

	point := model.Point{Lat: lat, Lng: lng}
	var events []model.GeofenceEvent
	now := time.Now()

	for _, g := range geofences {
		inside := h.isPointInGeofence(point, g)
		prevState := h.getDeviceState(ctx, deviceID, g.ID)
		wasInside := prevState != nil && prevState.Status == "inside"

		var triggerType model.TriggerType
		var triggered bool

		switch {
		case inside && !wasInside:
			// Device entered the geofence
			triggerType = model.TriggerTypeEnter
			triggered = true
			h.setDeviceState(ctx, deviceID, g.ID, &model.DeviceGeofenceState{
				Status:    "inside",
				EnteredAt: now,
				UpdatedAt: now,
			})

		case !inside && wasInside:
			// Device exited the geofence
			triggerType = model.TriggerTypeExit
			triggered = true
			h.setDeviceState(ctx, deviceID, g.ID, &model.DeviceGeofenceState{
				Status:    "outside",
				UpdatedAt: now,
			})

		case inside && wasInside:
			// Device still inside - check for dwell
			h.setDeviceState(ctx, deviceID, g.ID, &model.DeviceGeofenceState{
				Status:    "inside",
				EnteredAt: prevState.EnteredAt,
				UpdatedAt: now,
			})

			if g.DwellTimeSeconds > 0 && prevState.EnteredAt.Add(time.Duration(g.DwellTimeSeconds)*time.Second).Before(now) {
				// Check if we already sent a dwell event by checking a dwell flag
				dwellKey := fmt.Sprintf("geofence_dwell:%s:%s", deviceID.String(), g.ID.String())
				alreadyDwelled, _ := h.rdb.Exists(ctx, dwellKey).Result()
				if alreadyDwelled == 0 {
					triggerType = model.TriggerTypeDwell
					triggered = true
					// Mark dwell as sent so we don't re-trigger
					h.rdb.Set(ctx, dwellKey, "1", 24*time.Hour)
				}
			}

		case !inside && !wasInside:
			// Device still outside, update state
			h.setDeviceState(ctx, deviceID, g.ID, &model.DeviceGeofenceState{
				Status:    "outside",
				UpdatedAt: now,
			})
		}

		// On exit, clear the dwell flag
		if !inside && wasInside {
			dwellKey := fmt.Sprintf("geofence_dwell:%s:%s", deviceID.String(), g.ID.String())
			h.rdb.Del(ctx, dwellKey)
		}

		if triggered {
			event := model.GeofenceEvent{
				DeviceID:    deviceID,
				GeofenceID:  g.ID,
				OrgID:       orgID,
				TriggerType: triggerType,
				Latitude:    lat,
				Longitude:   lng,
				OccurredAt:  now,
			}
			events = append(events, event)

			if err := h.repo.SaveEvent(ctx, &event); err != nil {
				slog.Error("failed to save geofence event", "error", err)
			}

			subject := fmt.Sprintf("geofence.%s", triggerType)
			h.publishEvent(subject, map[string]interface{}{
				"device_id":    deviceID,
				"geofence_id":  g.ID,
				"org_id":       orgID,
				"trigger":      string(triggerType),
				"geofence_name": g.Name,
				"lat":          lat,
				"lng":          lng,
				"occurred_at":  now,
			})

			slog.Info("geofence transition",
				"device_id", deviceID,
				"geofence_id", g.ID,
				"trigger", triggerType,
			)
		}
	}

	return events, nil
}

// AddPolicy creates a geofence policy (action trigger).
func (h *GeofenceHandler) AddPolicy(ctx context.Context, p *model.GeofencePolicy) error {
	return h.repo.CreatePolicy(ctx, p)
}

// GetPolicies lists policies for a geofence.
func (h *GeofenceHandler) GetPolicies(ctx context.Context, geofenceID uuid.UUID) ([]*model.GeofencePolicy, error) {
	return h.repo.GetPoliciesByGeofence(ctx, geofenceID)
}

// DeletePolicy removes a geofence policy.
func (h *GeofenceHandler) DeletePolicy(ctx context.Context, id uuid.UUID) error {
	return h.repo.DeletePolicy(ctx, id)
}

// GetEvents lists recent events for a geofence.
func (h *GeofenceHandler) GetEvents(ctx context.Context, geofenceID uuid.UUID, limit int) ([]*model.GeofenceEvent, error) {
	return h.repo.ListEventsByGeofence(ctx, geofenceID, limit)
}

// stateKey returns the Redis key for device-geofence state.
func stateKey(deviceID, geofenceID uuid.UUID) string {
	return fmt.Sprintf("geofence:%s:%s", deviceID.String(), geofenceID.String())
}

func (h *GeofenceHandler) getDeviceState(ctx context.Context, deviceID, geofenceID uuid.UUID) *model.DeviceGeofenceState {
	if h.rdb == nil {
		return nil
	}
	data, err := h.rdb.Get(ctx, stateKey(deviceID, geofenceID)).Bytes()
	if err != nil {
		return nil
	}
	var state model.DeviceGeofenceState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil
	}
	return &state
}

func (h *GeofenceHandler) setDeviceState(ctx context.Context, deviceID, geofenceID uuid.UUID, state *model.DeviceGeofenceState) {
	if h.rdb == nil {
		return
	}
	data, err := json.Marshal(state)
	if err != nil {
		slog.Error("failed to marshal device state", "error", err)
		return
	}
	if err := h.rdb.Set(ctx, stateKey(deviceID, geofenceID), data, 48*time.Hour).Err(); err != nil {
		slog.Error("failed to set device state in Redis", "error", err)
	}
}

func (h *GeofenceHandler) isPointInGeofence(point model.Point, g *model.Geofence) bool {
	switch g.Type {
	case model.GeofenceTypeCircle:
		center := model.Point{Lat: g.CenterLat, Lng: g.CenterLng}
		return geo.PointInCircle(point, center, g.RadiusMeters)
	case model.GeofenceTypePolygon:
		var polygon []model.Point
		if err := json.Unmarshal(g.Polygon, &polygon); err != nil {
			slog.Error("failed to parse polygon", "geofence_id", g.ID, "error", err)
			return false
		}
		return geo.PointInPolygon(point, polygon)
	default:
		return false
	}
}

func (h *GeofenceHandler) publishEvent(subject string, data interface{}) {
	if h.nc == nil {
		return
	}
	payload, err := json.Marshal(data)
	if err != nil {
		slog.Error("failed to marshal event", "subject", subject, "error", err)
		return
	}
	if err := h.nc.Publish(subject, payload); err != nil {
		slog.Error("failed to publish event", "subject", subject, "error", err)
	}
}
