package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/policy-service/internal/engine"
	"github.com/sermetkartal/mdm/services/policy-service/internal/model"
	"github.com/sermetkartal/mdm/services/policy-service/internal/repository"
	"google.golang.org/grpc"
)

type PolicyHandler struct {
	repo     *repository.PolicyRepository
	resolver *engine.Resolver
	nc       *nats.Conn
}

func NewPolicyHandler(repo *repository.PolicyRepository, resolver *engine.Resolver, nc *nats.Conn) *PolicyHandler {
	return &PolicyHandler{repo: repo, resolver: resolver, nc: nc}
}

func (h *PolicyHandler) RegisterGRPC(server *grpc.Server) {
	// TODO: Register proto-generated service after protoc compilation
	// pb.RegisterPolicyServiceServer(server, h)
	slog.Info("policy handler registered")
}

// GetEffectivePolicies resolves and returns the effective policies for a device.
func (h *PolicyHandler) GetEffectivePolicies(ctx context.Context, orgID, deviceID uuid.UUID, groupIDs []uuid.UUID) ([]engine.ResolvedPolicy, error) {
	return h.resolver.GetEffectivePolicies(ctx, orgID, deviceID, groupIDs)
}

// PreviewEffectivePolicies returns what policies would apply to a device
// without persisting anything, including conflict resolution details.
func (h *PolicyHandler) PreviewEffectivePolicies(ctx context.Context, orgID, deviceID uuid.UUID, groupIDs []uuid.UUID) (*engine.PreviewResult, error) {
	return h.resolver.PreviewEffectivePolicies(ctx, orgID, deviceID, groupIDs)
}

// CreatePolicy creates a new policy with an initial version (version=1).
func (h *PolicyHandler) CreatePolicy(ctx context.Context, policy *model.Policy, initialPayload map[string]interface{}) error {
	if err := h.repo.Create(ctx, policy, initialPayload); err != nil {
		return err
	}

	h.publishEvent("policy.created", map[string]interface{}{
		"policy_id":   policy.ID,
		"org_id":      policy.OrgID,
		"policy_type": policy.PolicyType,
	})

	return nil
}

// UpdatePolicy updates a policy and creates a new version with incremented version number.
func (h *PolicyHandler) UpdatePolicy(ctx context.Context, policy *model.Policy, newPayload map[string]interface{}, updatedBy uuid.UUID) error {
	if err := h.repo.Update(ctx, policy, newPayload, updatedBy); err != nil {
		return err
	}

	latest, err := h.repo.GetLatestVersion(ctx, policy.ID)
	version := 0
	if err == nil {
		version = latest.Version
	}

	h.publishEvent("policy.updated", map[string]interface{}{
		"policy_id": policy.ID,
		"version":   version,
	})

	return nil
}

// GetPolicyVersions returns the full version history for a policy.
func (h *PolicyHandler) GetPolicyVersions(ctx context.Context, policyID uuid.UUID) ([]model.PolicyVersion, error) {
	return h.repo.GetPolicyVersions(ctx, policyID)
}

// AssignPolicy creates a policy assignment, resolves affected devices, and
// publishes a NATS "policy.deploy" event with the resolved payload.
func (h *PolicyHandler) AssignPolicy(ctx context.Context, assignment *model.PolicyAssignment, orgID uuid.UUID, groupIDs []uuid.UUID) error {
	if err := h.repo.CreateAssignment(ctx, assignment); err != nil {
		return err
	}

	// Resolve affected device IDs based on target type
	deviceIDs, err := h.resolveAffectedDevices(ctx, assignment.TargetType, assignment.TargetID, orgID)
	if err != nil {
		slog.Error("failed to resolve affected devices", "error", err)
		// Assignment was created; log error but don't fail the whole operation
	}

	// Get the latest version payload for this policy
	latest, err := h.repo.GetLatestVersion(ctx, assignment.PolicyID)
	if err != nil {
		slog.Error("failed to get latest policy version for deploy event", "error", err)
	}

	var resolvedPayload map[string]interface{}
	if latest != nil {
		resolvedPayload = latest.Payload
	}

	h.publishEvent("policy.deploy", map[string]interface{}{
		"policy_id":        assignment.PolicyID,
		"device_ids":       deviceIDs,
		"resolved_payload": resolvedPayload,
		"target_type":      assignment.TargetType,
		"target_id":        assignment.TargetID,
	})

	return nil
}

// UnassignPolicy removes a policy assignment, re-resolves affected devices,
// and publishes updated effective policies.
func (h *PolicyHandler) UnassignPolicy(ctx context.Context, assignmentID uuid.UUID, orgID uuid.UUID, groupIDs []uuid.UUID) error {
	// Fetch assignment before deleting so we know what was affected
	assignment, err := h.repo.GetAssignmentByID(ctx, assignmentID)
	if err != nil {
		return fmt.Errorf("assignment not found: %w", err)
	}

	if err := h.repo.DeleteAssignment(ctx, assignmentID); err != nil {
		return err
	}

	// Resolve affected device IDs
	deviceIDs, err := h.resolveAffectedDevices(ctx, assignment.TargetType, assignment.TargetID, orgID)
	if err != nil {
		slog.Error("failed to resolve affected devices for unassign", "error", err)
	}

	h.publishEvent("policy.deploy", map[string]interface{}{
		"policy_id":   assignment.PolicyID,
		"device_ids":  deviceIDs,
		"action":      "unassign",
		"target_type": assignment.TargetType,
		"target_id":   assignment.TargetID,
	})

	return nil
}

// resolveAffectedDevices returns device IDs affected by a policy assignment target.
func (h *PolicyHandler) resolveAffectedDevices(ctx context.Context, targetType model.AssignmentTarget, targetID, orgID uuid.UUID) ([]uuid.UUID, error) {
	switch targetType {
	case model.AssignmentTargetDevice:
		return []uuid.UUID{targetID}, nil
	case model.AssignmentTargetGroup:
		return h.repo.GetDeviceIDsByGroup(ctx, targetID)
	case model.AssignmentTargetOrg:
		return h.repo.GetDeviceIDsByOrg(ctx, orgID)
	default:
		return nil, fmt.Errorf("unknown target type: %s", targetType)
	}
}

func (h *PolicyHandler) publishEvent(subject string, data interface{}) {
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
