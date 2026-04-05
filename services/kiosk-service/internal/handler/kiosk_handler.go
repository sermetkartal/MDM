package handler

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/kiosk-service/internal/model"
	"github.com/sermetkartal/mdm/services/kiosk-service/internal/repository"
	"google.golang.org/grpc"
)

type KioskHandler struct {
	repo *repository.KioskRepository
	nc   *nats.Conn
}

func NewKioskHandler(repo *repository.KioskRepository, nc *nats.Conn) *KioskHandler {
	return &KioskHandler{repo: repo, nc: nc}
}

func (h *KioskHandler) RegisterGRPC(server *grpc.Server) {
	// TODO: Register proto-generated service after protoc compilation
	slog.Info("kiosk handler registered")
}

func (h *KioskHandler) CreateProfile(ctx context.Context, profile *model.KioskProfile) error {
	if err := h.repo.CreateProfile(ctx, profile); err != nil {
		return err
	}
	h.publishEvent("kiosk.profile.created", map[string]interface{}{
		"profile_id": profile.ID,
		"org_id":     profile.OrgID,
		"mode":       profile.Mode,
	})
	return nil
}

func (h *KioskHandler) UpdateProfile(ctx context.Context, profile *model.KioskProfile) error {
	if err := h.repo.UpdateProfile(ctx, profile); err != nil {
		return err
	}
	h.publishEvent("kiosk.profile.updated", map[string]interface{}{
		"profile_id": profile.ID,
	})
	return nil
}

func (h *KioskHandler) GetProfile(ctx context.Context, id uuid.UUID) (*model.KioskProfile, error) {
	return h.repo.GetProfileByID(ctx, id)
}

func (h *KioskHandler) AssignProfile(ctx context.Context, assignment *model.KioskAssignment) error {
	if err := h.repo.CreateAssignment(ctx, assignment); err != nil {
		return err
	}
	h.publishEvent("kiosk.profile.assigned", map[string]interface{}{
		"profile_id":  assignment.KioskProfileID,
		"target_type": assignment.TargetType,
		"target_id":   assignment.TargetID,
	})
	return nil
}

func (h *KioskHandler) GetDeviceKioskConfig(ctx context.Context, deviceID uuid.UUID) (*model.KioskProfile, error) {
	assignments, err := h.repo.GetAssignmentsByTarget(ctx, "device", deviceID)
	if err != nil {
		return nil, err
	}
	if len(assignments) == 0 {
		return nil, nil
	}
	return h.repo.GetProfileByID(ctx, assignments[0].KioskProfileID)
}

func (h *KioskHandler) publishEvent(subject string, data interface{}) {
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
