package dispatcher

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/command-service/internal/fcm"
	"github.com/sermetkartal/mdm/services/command-service/internal/model"
	"github.com/sermetkartal/mdm/services/command-service/internal/queue"
	"github.com/sermetkartal/mdm/services/command-service/internal/repository"
)

const maxRetries = 5

// retryDelays defines the exponential backoff schedule.
var retryDelays = [maxRetries]time.Duration{
	1 * time.Second,
	5 * time.Second,
	30 * time.Second,
	2 * time.Minute,
	10 * time.Minute,
}

// DeviceTokenLookup resolves a device's FCM token from the device-service DB.
type DeviceTokenLookup interface {
	GetFCMToken(ctx context.Context, deviceID uuid.UUID) (string, error)
}

// DBTokenLookup performs FCM token lookup via direct DB access.
type DBTokenLookup struct {
	db *sql.DB
}

func NewDBTokenLookup(db *sql.DB) *DBTokenLookup {
	return &DBTokenLookup{db: db}
}

func (l *DBTokenLookup) GetFCMToken(ctx context.Context, deviceID uuid.UUID) (string, error) {
	var token string
	err := l.db.QueryRowContext(ctx,
		`SELECT fcm_token FROM devices WHERE id = $1 AND fcm_token IS NOT NULL`, deviceID,
	).Scan(&token)
	if err != nil {
		return "", fmt.Errorf("failed to lookup FCM token for device %s: %w", deviceID, err)
	}
	return token, nil
}

// Dispatcher picks commands from the queue and delivers them via FCM push
// or a gRPC stream, with retry support using exponential backoff.
type Dispatcher struct {
	repo        *repository.CommandRepository
	fcmClient   *fcm.Client
	queue       *queue.NATSQueue
	tokenLookup DeviceTokenLookup
}

func NewDispatcher(repo *repository.CommandRepository, fcmClient *fcm.Client, q *queue.NATSQueue, tokenLookup DeviceTokenLookup) *Dispatcher {
	return &Dispatcher{
		repo:        repo,
		fcmClient:   fcmClient,
		queue:       q,
		tokenLookup: tokenLookup,
	}
}

// HandleCommand processes a single command from the queue.
func (d *Dispatcher) HandleCommand(cmd *model.Command, ack func() error) error {
	ctx := context.Background()

	// Transition: pending -> queued -> sent
	d.updateStatus(ctx, cmd, model.CommandStatusQueued, "command picked from queue")

	// Check if command has expired
	if cmd.ExpiresAt != nil && time.Now().After(*cmd.ExpiresAt) {
		d.updateStatus(ctx, cmd, model.CommandStatusExpired, "command expired before delivery")
		return ack()
	}

	// Attempt delivery with retries
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			delay := retryDelays[attempt]
			slog.Info("retrying command delivery",
				"command_id", cmd.ID, "attempt", attempt+1, "delay", delay)
			time.Sleep(delay)
		}

		lastErr = d.deliver(ctx, cmd)
		if lastErr == nil {
			d.updateStatus(ctx, cmd, model.CommandStatusDelivered, "command sent to device")
			return ack()
		}

		slog.Warn("command delivery failed",
			"command_id", cmd.ID, "attempt", attempt+1, "error", lastErr)
	}

	// All retries exhausted - mark as failed and publish failure event
	reason := "delivery failed after retries: " + lastErr.Error()
	d.updateStatus(ctx, cmd, model.CommandStatusFailed, reason)

	if d.queue != nil {
		if err := d.queue.PublishFailed(ctx, cmd, reason); err != nil {
			slog.Error("failed to publish command.failed event", "command_id", cmd.ID, "error", err)
		}
	}

	return ack()
}

func (d *Dispatcher) deliver(ctx context.Context, cmd *model.Command) error {
	if d.fcmClient == nil {
		return fmt.Errorf("no delivery mechanism available")
	}

	// Look up device FCM token
	var fcmToken string
	if d.tokenLookup != nil {
		token, err := d.tokenLookup.GetFCMToken(ctx, cmd.DeviceID)
		if err != nil {
			return fmt.Errorf("FCM token lookup failed: %w", err)
		}
		fcmToken = token
	} else {
		// Fallback: use device ID as token placeholder (for testing/dev)
		fcmToken = cmd.DeviceID.String()
	}

	return d.fcmClient.SendToDevice(ctx, fcmToken, cmd.ID.String(), string(cmd.CommandType))
}

func (d *Dispatcher) updateStatus(ctx context.Context, cmd *model.Command, status model.CommandStatus, message string) {
	if err := d.repo.UpdateStatus(ctx, cmd.ID, status, message); err != nil {
		slog.Error("failed to update command status",
			"command_id", cmd.ID, "status", status, "error", err)
		return
	}

	cmd.Status = status

	// Publish status change event
	if d.queue != nil {
		if err := d.queue.PublishStatusChanged(ctx, cmd); err != nil {
			slog.Error("failed to publish status changed event",
				"command_id", cmd.ID, "error", err)
		}
	}
}
