package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/command-service/internal/model"
	"github.com/sermetkartal/mdm/services/command-service/internal/queue"
	"github.com/sermetkartal/mdm/services/command-service/internal/repository"
	"google.golang.org/grpc"
)

// GroupResolver resolves a device group to its member device IDs.
type GroupResolver interface {
	GetGroupMembers(ctx context.Context, groupID uuid.UUID) ([]uuid.UUID, error)
}

// DBGroupResolver resolves group members from the database.
type DBGroupResolver struct {
	repo *repository.CommandRepository
}

func NewDBGroupResolver(repo *repository.CommandRepository) *DBGroupResolver {
	return &DBGroupResolver{repo: repo}
}

func (r *DBGroupResolver) GetGroupMembers(ctx context.Context, groupID uuid.UUID) ([]uuid.UUID, error) {
	return r.repo.GetGroupMembers(ctx, groupID)
}

type CommandHandler struct {
	repo          *repository.CommandRepository
	queue         *queue.NATSQueue
	nc            *nats.Conn
	groupResolver GroupResolver
}

func NewCommandHandler(repo *repository.CommandRepository, q *queue.NATSQueue, nc *nats.Conn) *CommandHandler {
	return &CommandHandler{
		repo:          repo,
		queue:         q,
		nc:            nc,
		groupResolver: NewDBGroupResolver(repo),
	}
}

func (h *CommandHandler) SetGroupResolver(resolver GroupResolver) {
	h.groupResolver = resolver
}

func (h *CommandHandler) RegisterGRPC(server *grpc.Server) {
	// TODO: Register proto-generated service after protoc compilation
	// pb.RegisterCommandServiceServer(server, h)
	slog.Info("command handler registered")
}

func (h *CommandHandler) Dispatch(ctx context.Context, cmd *model.Command) error {
	cmd.Status = model.CommandStatusPending

	if err := h.repo.Create(ctx, cmd); err != nil {
		return err
	}

	if h.queue != nil {
		if err := h.queue.Publish(ctx, cmd); err != nil {
			slog.Error("failed to enqueue command", "command_id", cmd.ID, "error", err)
			return err
		}
		h.repo.UpdateStatus(ctx, cmd.ID, model.CommandStatusQueued, "command queued for delivery")
	}

	h.publishEvent("command.dispatched", map[string]interface{}{
		"command_id":   cmd.ID,
		"device_id":    cmd.DeviceID,
		"command_type": cmd.CommandType,
	})

	return nil
}

// BulkDispatch sends a command to multiple devices. Returns the list of
// successfully created command IDs.
func (h *CommandHandler) BulkDispatch(ctx context.Context, deviceIDs []uuid.UUID, cmdTemplate *model.Command) ([]uuid.UUID, error) {
	var commandIDs []uuid.UUID

	for _, deviceID := range deviceIDs {
		cmd := &model.Command{
			OrgID:       cmdTemplate.OrgID,
			DeviceID:    deviceID,
			CommandType: cmdTemplate.CommandType,
			Payload:     cmdTemplate.Payload,
			IssuedBy:    cmdTemplate.IssuedBy,
			ExpiresAt:   cmdTemplate.ExpiresAt,
		}

		if err := h.Dispatch(ctx, cmd); err != nil {
			slog.Error("failed to dispatch to device", "device_id", deviceID, "error", err)
			continue
		}
		commandIDs = append(commandIDs, cmd.ID)
	}

	return commandIDs, nil
}

// BulkDispatchToGroup resolves the members of a device group and dispatches
// the command to each member.
func (h *CommandHandler) BulkDispatchToGroup(ctx context.Context, groupID uuid.UUID, cmdTemplate *model.Command) ([]uuid.UUID, error) {
	if h.groupResolver == nil {
		return nil, fmt.Errorf("group resolver not configured")
	}

	deviceIDs, err := h.groupResolver.GetGroupMembers(ctx, groupID)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve group %s: %w", groupID, err)
	}

	if len(deviceIDs) == 0 {
		return nil, fmt.Errorf("group %s has no members", groupID)
	}

	slog.Info("bulk dispatching to group",
		"group_id", groupID,
		"device_count", len(deviceIDs),
		"command_type", cmdTemplate.CommandType,
	)

	return h.BulkDispatch(ctx, deviceIDs, cmdTemplate)
}

func (h *CommandHandler) Cancel(ctx context.Context, commandID uuid.UUID) error {
	if err := h.repo.CancelCommand(ctx, commandID); err != nil {
		return err
	}

	h.publishEvent("command.cancelled", map[string]interface{}{
		"command_id": commandID,
	})

	return nil
}

func (h *CommandHandler) GetStatus(ctx context.Context, commandID uuid.UUID) (*model.Command, []model.CommandHistory, error) {
	cmd, err := h.repo.GetByID(ctx, commandID)
	if err != nil {
		return nil, nil, err
	}

	history, err := h.repo.GetHistory(ctx, commandID)
	if err != nil {
		return cmd, nil, err
	}

	return cmd, history, nil
}

func (h *CommandHandler) publishEvent(subject string, data interface{}) {
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
