package subscriber

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/handler"
)

// HeartbeatEvent represents the data received from device.heartbeat NATS messages.
type HeartbeatEvent struct {
	DeviceID     uuid.UUID `json:"device_id"`
	OrgID        uuid.UUID `json:"org_id"`
	BatteryLevel int32     `json:"battery_level"`
	OSVersion    string    `json:"os_version"`
	AgentVersion string    `json:"agent_version"`
	// Security state
	EncryptionEnabled       bool `json:"encryption_enabled"`
	IsRooted                bool `json:"is_rooted"`
	DeveloperOptionsEnabled bool `json:"developer_options_enabled"`
	// Resource metrics
	StorageFreeMB int64  `json:"storage_free_mb"`
	MemoryFreeMB  int64  `json:"memory_free_mb"`
	Model         string `json:"model"`
}

// HeartbeatSubscriber listens for device heartbeat events on NATS and triggers compliance evaluation.
type HeartbeatSubscriber struct {
	nc      *nats.Conn
	handler *handler.ComplianceHandler
	sub     *nats.Subscription
}

func NewHeartbeatSubscriber(nc *nats.Conn, handler *handler.ComplianceHandler) *HeartbeatSubscriber {
	return &HeartbeatSubscriber{nc: nc, handler: handler}
}

// Start subscribes to the device.heartbeat NATS subject.
func (s *HeartbeatSubscriber) Start() error {
	if s.nc == nil {
		slog.Warn("NATS not connected, heartbeat subscriber not started")
		return nil
	}

	var err error
	s.sub, err = s.nc.Subscribe("device.heartbeat", func(msg *nats.Msg) {
		s.handleHeartbeat(msg)
	})
	if err != nil {
		return err
	}

	slog.Info("heartbeat subscriber started on device.heartbeat")
	return nil
}

// Stop unsubscribes from NATS.
func (s *HeartbeatSubscriber) Stop() {
	if s.sub != nil {
		s.sub.Unsubscribe()
	}
}

func (s *HeartbeatSubscriber) handleHeartbeat(msg *nats.Msg) {
	var event HeartbeatEvent
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		slog.Error("failed to unmarshal heartbeat event", "error", err)
		return
	}

	if event.DeviceID == uuid.Nil || event.OrgID == uuid.Nil {
		slog.Warn("heartbeat event missing device_id or org_id")
		return
	}

	// Build device state map from heartbeat data for evaluation
	deviceState := map[string]interface{}{
		"os_version":               event.OSVersion,
		"agent_version":            event.AgentVersion,
		"encryption_enabled":       event.EncryptionEnabled,
		"is_rooted":                event.IsRooted,
		"developer_options_enabled": event.DeveloperOptionsEnabled,
		"battery_level":            event.BatteryLevel,
		"storage_free_mb":          event.StorageFreeMB,
		"memory_free_mb":           event.MemoryFreeMB,
		"model":                    event.Model,
	}

	ctx := context.Background()
	status, err := s.handler.EvaluateCompliance(ctx, event.OrgID, event.DeviceID, deviceState)
	if err != nil {
		slog.Error("failed to evaluate compliance on heartbeat",
			"device_id", event.DeviceID, "error", err)
		return
	}

	slog.Debug("compliance evaluated on heartbeat",
		"device_id", event.DeviceID,
		"is_compliant", status.IsCompliant,
		"violations", len(status.Violations))
}
