package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/device-service/internal/model"
	"github.com/sermetkartal/mdm/services/device-service/internal/repository"
	"google.golang.org/grpc"
)

type DeviceHandler struct {
	repo *repository.DeviceRepository
	nc   *nats.Conn
	db   *sql.DB
}

func NewDeviceHandler(repo *repository.DeviceRepository, nc *nats.Conn, db *sql.DB) *DeviceHandler {
	return &DeviceHandler{repo: repo, nc: nc, db: db}
}

func (h *DeviceHandler) RegisterGRPC(server *grpc.Server) {
	// TODO: Register proto-generated service after protoc compilation
	// pb.RegisterDeviceServiceServer(server, h)
	slog.Info("device handler registered")
}

func (h *DeviceHandler) HandleEnroll(ctx context.Context, req *model.EnrollRequest) (*model.Device, error) {
	now := time.Now()
	device := &model.Device{
		SerialNumber:     req.SerialNumber,
		HardwareID:       req.HardwareID,
		Model:            req.Model,
		Manufacturer:     req.Manufacturer,
		OSType:           "android",
		OSVersion:        req.OSVersion,
		AgentVersion:     req.AgentVersion,
		EnrollmentStatus: model.EnrollmentStatusEnrolled,
		ComplianceState:  model.ComplianceStatePending,
		EnrolledAt:       &now,
	}

	if err := h.repo.Create(ctx, device); err != nil {
		return nil, err
	}

	h.publishEvent("device.enrolled", map[string]interface{}{
		"device_id":     device.ID,
		"serial_number": device.SerialNumber,
		"org_id":        device.OrgID,
		"enrolled_at":   now,
	})

	return device, nil
}

func (h *DeviceHandler) HandleHeartbeat(ctx context.Context, data *model.HeartbeatData) (int64, error) {
	if err := h.repo.UpdateLastSeen(ctx, data.DeviceID); err != nil {
		slog.Error("failed to update last seen", "device_id", data.DeviceID, "error", err)
		return 60, err
	}

	h.publishEvent("device.heartbeat", map[string]interface{}{
		"device_id":     data.DeviceID,
		"battery_level": data.BatteryLevel,
		"os_version":    data.OSVersion,
	})

	return 60, nil // next heartbeat in 60 seconds
}

func (h *DeviceHandler) HandleUnenroll(ctx context.Context, deviceID uuid.UUID) error {
	if err := h.repo.UpdateStatus(ctx, deviceID, model.EnrollmentStatusUnenrolled); err != nil {
		return err
	}

	h.publishEvent("device.unenrolled", map[string]interface{}{
		"device_id": deviceID,
	})

	return nil
}

// CommandStreamMessage represents a command sent to a device over the bidirectional stream.
type CommandStreamMessage struct {
	CommandID   uuid.UUID              `json:"command_id"`
	CommandType string                 `json:"command_type"`
	Payload     map[string]interface{} `json:"payload"`
}

// CommandAck represents a device's acknowledgement of a command.
type CommandAck struct {
	CommandID uuid.UUID `json:"command_id"`
	Status    string    `json:"status"` // "received", "executing", "completed", "failed"
	Message   string    `json:"message"`
}

// CommandStream represents the bidirectional stream interface.
// In production this is backed by a gRPC stream; here we define the
// send/recv contract so the handler logic is testable.
type CommandStream interface {
	Send(msg *CommandStreamMessage) error
	Recv() (*CommandAck, error)
}

// HandleCommandStream implements the bidirectional gRPC streaming RPC.
// The device connects and authenticates via device_id extracted from mTLS cert.
// Server sends pending commands and receives acknowledgements.
func (h *DeviceHandler) HandleCommandStream(deviceID uuid.UUID, stream CommandStream) error {
	ctx := context.Background()
	slog.Info("command stream opened", "device_id", deviceID)

	// Send any pending commands from DB
	if err := h.sendPendingCommands(ctx, deviceID, stream); err != nil {
		slog.Error("failed to send pending commands", "device_id", deviceID, "error", err)
	}

	// Process acknowledgements from the device
	for {
		ack, err := stream.Recv()
		if err == io.EOF {
			slog.Info("command stream closed by device", "device_id", deviceID)
			return nil
		}
		if err != nil {
			slog.Error("command stream recv error", "device_id", deviceID, "error", err)
			return err
		}

		slog.Info("command ack received",
			"device_id", deviceID,
			"command_id", ack.CommandID,
			"status", ack.Status,
		)

		// Map device ack status to command status
		var cmdStatus string
		switch ack.Status {
		case "received":
			cmdStatus = "delivered"
		case "executing":
			cmdStatus = "executing"
		case "completed":
			cmdStatus = "completed"
		case "failed":
			cmdStatus = "failed"
		default:
			cmdStatus = ack.Status
		}

		// Update command status in DB
		if err := h.updateCommandStatus(ctx, ack.CommandID, cmdStatus, ack.Message); err != nil {
			slog.Error("failed to update command status", "command_id", ack.CommandID, "error", err)
			continue
		}

		// Publish NATS status change event
		h.publishEvent("command.status_changed", map[string]interface{}{
			"command_id": ack.CommandID,
			"device_id":  deviceID,
			"status":     cmdStatus,
			"message":    ack.Message,
		})
	}
}

// sendPendingCommands queries the DB for commands pending delivery and sends them on the stream.
func (h *DeviceHandler) sendPendingCommands(ctx context.Context, deviceID uuid.UUID, stream CommandStream) error {
	rows, err := h.db.QueryContext(ctx, `
		SELECT id, command_type, payload
		FROM commands
		WHERE device_id = $1 AND status IN ('pending', 'queued', 'sent')
		ORDER BY created_at ASC`, deviceID)
	if err != nil {
		return fmt.Errorf("failed to query pending commands: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cmdID uuid.UUID
		var cmdType string
		var payloadJSON []byte

		if err := rows.Scan(&cmdID, &cmdType, &payloadJSON); err != nil {
			slog.Error("failed to scan pending command", "error", err)
			continue
		}

		var payload map[string]interface{}
		if len(payloadJSON) > 0 {
			json.Unmarshal(payloadJSON, &payload)
		}

		msg := &CommandStreamMessage{
			CommandID:   cmdID,
			CommandType: cmdType,
			Payload:     payload,
		}

		if err := stream.Send(msg); err != nil {
			return fmt.Errorf("failed to send command %s: %w", cmdID, err)
		}

		// Mark as delivered
		h.updateCommandStatus(ctx, cmdID, "delivered", "sent via gRPC stream")
		slog.Info("command sent via stream", "command_id", cmdID, "device_id", deviceID)
	}

	return nil
}

// updateCommandStatus updates a command's status and records history.
func (h *DeviceHandler) updateCommandStatus(ctx context.Context, commandID uuid.UUID, status string, message string) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx,
		`UPDATE commands SET status = $2, updated_at = NOW() WHERE id = $1`, commandID, status)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO command_history (id, command_id, status, message, created_at)
		VALUES ($1, $2, $3, $4, $5)`,
		uuid.New(), commandID, status, message, time.Now())
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (h *DeviceHandler) publishEvent(subject string, data interface{}) {
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
