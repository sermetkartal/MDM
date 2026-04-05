package model

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

type GeofenceType string

const (
	GeofenceTypeCircle  GeofenceType = "circle"
	GeofenceTypePolygon GeofenceType = "polygon"
)

type TriggerType string

const (
	TriggerTypeEnter TriggerType = "enter"
	TriggerTypeExit  TriggerType = "exit"
	TriggerTypeDwell TriggerType = "dwell"
)

type ActionType string

const (
	ActionTypeLock         ActionType = "lock"
	ActionTypeRestrict     ActionType = "restrict"
	ActionTypeNotify       ActionType = "notify"
	ActionTypeEnablePolicy ActionType = "enable_policy"
)

type Geofence struct {
	ID               uuid.UUID       `db:"id" json:"id"`
	OrgID            uuid.UUID       `db:"org_id" json:"org_id"`
	Name             string          `db:"name" json:"name"`
	Type             GeofenceType    `db:"type" json:"type"`
	CenterLat        float64         `db:"center_lat" json:"center_lat,omitempty"`
	CenterLng        float64         `db:"center_lng" json:"center_lng,omitempty"`
	RadiusMeters     float64         `db:"radius_meters" json:"radius_meters,omitempty"`
	Polygon          json.RawMessage `db:"polygon" json:"polygon,omitempty"`
	DwellTimeSeconds int             `db:"dwell_time_seconds" json:"dwell_time_seconds"`
	IsActive         bool            `db:"is_active" json:"is_active"`
	CreatedAt        time.Time       `db:"created_at" json:"created_at"`
	UpdatedAt        time.Time       `db:"updated_at" json:"updated_at"`
}

// Validate checks that the geofence has valid configuration for its type.
func (g *Geofence) Validate() error {
	if g.Name == "" {
		return errors.New("name is required")
	}
	switch g.Type {
	case GeofenceTypeCircle:
		if g.CenterLat < -90 || g.CenterLat > 90 {
			return errors.New("center_lat must be between -90 and 90")
		}
		if g.CenterLng < -180 || g.CenterLng > 180 {
			return errors.New("center_lng must be between -180 and 180")
		}
		if g.RadiusMeters <= 0 {
			return errors.New("radius_meters must be positive")
		}
	case GeofenceTypePolygon:
		var points []Point
		if err := json.Unmarshal(g.Polygon, &points); err != nil {
			return errors.New("polygon must be a valid JSON array of points")
		}
		if len(points) < 3 {
			return errors.New("polygon requires at least 3 points")
		}
		for _, p := range points {
			if p.Lat < -90 || p.Lat > 90 || p.Lng < -180 || p.Lng > 180 {
				return errors.New("all polygon points must have valid lat/lng")
			}
		}
	default:
		return errors.New("type must be 'circle' or 'polygon'")
	}
	if g.DwellTimeSeconds < 0 {
		return errors.New("dwell_time_seconds must be non-negative")
	}
	return nil
}

type GeofencePolicy struct {
	ID           uuid.UUID       `db:"id" json:"id"`
	GeofenceID   uuid.UUID       `db:"geofence_id" json:"geofence_id"`
	TriggerType  TriggerType     `db:"trigger_type" json:"trigger_type"`
	ActionType   ActionType      `db:"action_type" json:"action_type"`
	ActionConfig json.RawMessage `db:"action_config" json:"action_config,omitempty"`
	CreatedAt    time.Time       `db:"created_at" json:"created_at"`
}

type GeofenceEvent struct {
	ID         uuid.UUID   `db:"id" json:"id"`
	DeviceID   uuid.UUID   `json:"device_id"`
	GeofenceID uuid.UUID   `json:"geofence_id"`
	OrgID      uuid.UUID   `json:"org_id"`
	TriggerType TriggerType `json:"trigger_type"`
	Latitude   float64     `json:"latitude"`
	Longitude  float64     `json:"longitude"`
	OccurredAt time.Time   `json:"occurred_at"`
}

type Point struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// DeviceGeofenceState tracks whether a device is inside or outside a geofence.
type DeviceGeofenceState struct {
	Status    string    `json:"status"` // "inside" or "outside"
	EnteredAt time.Time `json:"entered_at,omitempty"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TelemetryMessage is the payload received from device.telemetry NATS subject.
type TelemetryMessage struct {
	DeviceID  uuid.UUID `json:"device_id"`
	OrgID     uuid.UUID `json:"org_id"`
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	Timestamp time.Time `json:"timestamp"`
}
