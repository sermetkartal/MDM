package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/remote-control-service/internal/config"
	"github.com/sermetkartal/mdm/services/remote-control-service/internal/model"
	"github.com/sermetkartal/mdm/services/remote-control-service/internal/repository"
	"github.com/sermetkartal/mdm/services/remote-control-service/internal/signaling"
	"google.golang.org/grpc"
)

type RemoteHandler struct {
	repo  *repository.SessionRepository
	relay *signaling.Relay
	nc    *nats.Conn
	cfg   *config.Config
}

func NewRemoteHandler(repo *repository.SessionRepository, relay *signaling.Relay, nc *nats.Conn, cfg *config.Config) *RemoteHandler {
	return &RemoteHandler{repo: repo, relay: relay, nc: nc, cfg: cfg}
}

func (h *RemoteHandler) RegisterGRPC(server *grpc.Server) {
	// TODO: Register proto-generated service after protoc compilation
	slog.Info("remote-control handler registered")
}

func (h *RemoteHandler) CreateSession(orgID, deviceID, userID uuid.UUID) (*model.Session, error) {
	// Enforce concurrent session limit per device
	if h.repo.HasActiveSession(deviceID) {
		return nil, fmt.Errorf("device %s already has an active remote session", deviceID)
	}

	session := &model.Session{
		OrgID:    orgID,
		DeviceID: deviceID,
		UserID:   userID,
		Quality:  model.QualityMedium,
	}

	if err := h.repo.Create(session); err != nil {
		return nil, err
	}

	h.relay.CreateChannel(session.ID)

	h.publishAuditEvent("remote.session.started", map[string]interface{}{
		"session_id": session.ID,
		"device_id":  deviceID,
		"user_id":    userID,
		"org_id":     orgID,
	})

	slog.Info("remote session created",
		"session_id", session.ID,
		"device_id", deviceID,
		"user_id", userID,
	)

	return session, nil
}

func (h *RemoteHandler) GetSession(sessionID uuid.UUID) (*model.SessionStatus, error) {
	session, err := h.repo.GetByID(sessionID)
	if err != nil {
		return nil, err
	}

	duration := int64(0)
	if session.State != model.SessionStateEnded {
		duration = int64(time.Since(session.CreatedAt).Seconds())
	} else if session.EndedAt != nil {
		duration = int64(session.EndedAt.Sub(session.CreatedAt).Seconds())
	}

	return &model.SessionStatus{
		ID:        session.ID,
		DeviceID:  session.DeviceID,
		State:     session.State,
		Quality:   session.Quality,
		Duration:  duration,
		CreatedAt: session.CreatedAt,
	}, nil
}

func (h *RemoteHandler) HandleSignaling(msg model.SignalingMessage) error {
	session, err := h.repo.GetByID(msg.SessionID)
	if err != nil {
		return err
	}

	if session.State == model.SessionStateEnded {
		return fmt.Errorf("session %s has ended", msg.SessionID)
	}

	// Update session state based on message type
	switch msg.Type {
	case model.MessageTypeOffer:
		h.repo.UpdateState(session.ID, model.SessionStateConnecting)
	case model.MessageTypeAnswer:
		h.repo.UpdateState(session.ID, model.SessionStateActive)
	case model.MessageTypeQualityChange:
		// Parse quality from payload
		var qp struct {
			Quality model.QualityPreset `json:"quality"`
		}
		if err := json.Unmarshal([]byte(msg.Payload), &qp); err == nil {
			h.repo.UpdateQuality(session.ID, qp.Quality)
		}
	}

	// Touch activity timestamp
	h.repo.TouchActivity(msg.SessionID)

	return h.relay.SendMessage(msg)
}

func (h *RemoteHandler) EndSession(sessionID uuid.UUID) error {
	session, err := h.repo.GetByID(sessionID)
	if err != nil {
		return err
	}

	if err := h.repo.UpdateState(sessionID, model.SessionStateEnded); err != nil {
		return err
	}

	// Send bye message to both sides
	h.relay.SendMessage(model.SignalingMessage{
		SessionID: sessionID,
		Type:      model.MessageTypeBye,
		From:      "server",
	})

	h.relay.CloseChannel(sessionID)

	h.publishAuditEvent("remote.session.ended", map[string]interface{}{
		"session_id":       sessionID,
		"device_id":        session.DeviceID,
		"user_id":          session.UserID,
		"duration_seconds": int64(time.Since(session.CreatedAt).Seconds()),
	})

	slog.Info("remote session ended",
		"session_id", sessionID,
		"duration_seconds", int64(time.Since(session.CreatedAt).Seconds()),
	)

	return nil
}

func (h *RemoteHandler) GetICEServers() []config.ICEServer {
	return h.cfg.ICEServers
}

// CleanupExpiredSessions ends sessions that have been inactive beyond the TTL.
func (h *RemoteHandler) CleanupExpiredSessions() {
	expiredIDs := h.repo.GetExpiredActive(h.cfg.SessionTTL)
	for _, id := range expiredIDs {
		slog.Info("auto-ending expired session", "session_id", id)
		h.EndSession(id)
	}
	cleaned := h.repo.CleanupExpired(h.cfg.SessionTTL * 2)
	if cleaned > 0 {
		slog.Info("cleaned up expired session records", "count", cleaned)
	}
}

func (h *RemoteHandler) publishAuditEvent(subject string, data interface{}) {
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
