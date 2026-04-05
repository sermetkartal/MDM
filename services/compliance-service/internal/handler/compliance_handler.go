package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/engine"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/model"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/repository"
	"google.golang.org/grpc"
)

type ComplianceHandler struct {
	repo      *repository.ComplianceRepository
	evaluator *engine.Evaluator
	nc        *nats.Conn
}

func NewComplianceHandler(repo *repository.ComplianceRepository, evaluator *engine.Evaluator, nc *nats.Conn) *ComplianceHandler {
	return &ComplianceHandler{repo: repo, evaluator: evaluator, nc: nc}
}

func (h *ComplianceHandler) RegisterGRPC(server *grpc.Server) {
	slog.Info("compliance handler registered")
}

// EvaluateCompliance evaluates all active rules for a device and manages violation lifecycle.
func (h *ComplianceHandler) EvaluateCompliance(ctx context.Context, orgID, deviceID uuid.UUID, deviceState map[string]interface{}) (*model.ComplianceStatus, error) {
	rules, err := h.repo.ListRulesByOrg(ctx, orgID)
	if err != nil {
		return nil, err
	}

	status := &model.ComplianceStatus{
		DeviceID:    deviceID,
		IsCompliant: true,
		EvaluatedAt: time.Now(),
	}

	// Get existing active violations for this device
	existingViolations, err := h.repo.GetActiveViolationsByDeviceAndOrg(ctx, orgID, deviceID)
	if err != nil {
		slog.Error("failed to get existing violations", "error", err)
		existingViolations = nil
	}

	// Track which rules are currently violated
	violatedRuleIDs := make(map[uuid.UUID]bool)

	for _, rule := range rules {
		compliant, err := h.evaluator.Evaluate(rule, deviceState)
		if err != nil {
			slog.Error("failed to evaluate rule", "rule_id", rule.ID, "error", err)
			continue
		}

		if !compliant {
			status.IsCompliant = false
			violatedRuleIDs[rule.ID] = true

			// Check if an active violation already exists for this device+rule
			if h.hasActiveViolation(existingViolations, rule.ID) {
				continue // skip duplicate
			}

			detail, _ := json.Marshal(map[string]interface{}{
				"rule_name":    rule.Name,
				"device_state": deviceState,
			})

			violation := &model.ComplianceViolation{
				OrgID:    orgID,
				RuleID:   rule.ID,
				DeviceID: deviceID,
				Status:   model.ViolationStatusActive,
				Detail:   detail,
			}

			if err := h.repo.CreateViolation(ctx, violation); err != nil {
				slog.Error("failed to create violation", "error", err)
				continue
			}

			status.Violations = append(status.Violations, *violation)

			// Dispatch action based on rule configuration
			h.dispatchAction(ctx, rule, deviceID, orgID)
		}
	}

	// Resolve violations for rules that are now compliant
	for _, existing := range existingViolations {
		if !violatedRuleIDs[existing.RuleID] {
			if err := h.repo.ResolveViolation(ctx, existing.ID); err != nil {
				slog.Error("failed to resolve violation", "violation_id", existing.ID, "error", err)
			} else {
				slog.Info("resolved violation", "violation_id", existing.ID, "rule_id", existing.RuleID, "device_id", deviceID)
			}
		}
	}

	// Publish evaluation result
	h.publishEvent("compliance.evaluated", map[string]interface{}{
		"device_id":    deviceID,
		"org_id":       orgID,
		"is_compliant": status.IsCompliant,
		"violations":   len(status.Violations),
		"evaluated_at": status.EvaluatedAt,
	})

	return status, nil
}

// dispatchAction dispatches the configured action for a violated rule.
func (h *ComplianceHandler) dispatchAction(ctx context.Context, rule *model.ComplianceRule, deviceID, orgID uuid.UUID) {
	// Check for grace period
	if rule.ActionConfig != nil {
		var actionCfg model.ActionConfig
		if err := json.Unmarshal(rule.ActionConfig, &actionCfg); err == nil && actionCfg.GracePeriodHours > 0 {
			slog.Info("violation has grace period, deferring action",
				"rule_id", rule.ID, "device_id", deviceID, "grace_hours", actionCfg.GracePeriodHours)
			return // Grace period handler will pick this up
		}
	}

	h.executeAction(rule, deviceID, orgID)
}

// executeAction performs the actual action dispatch.
func (h *ComplianceHandler) executeAction(rule *model.ComplianceRule, deviceID, orgID uuid.UUID) {
	basePayload := map[string]interface{}{
		"device_id": deviceID,
		"org_id":    orgID,
		"rule_id":   rule.ID,
		"severity":  rule.Severity,
	}

	switch rule.Action {
	case model.ActionAlert:
		h.publishEvent("compliance.violated", basePayload)

	case model.ActionLock:
		h.publishEvent("command.dispatch", map[string]interface{}{
			"device_id":    deviceID,
			"org_id":       orgID,
			"command_type": "LOCK",
			"source":       "compliance",
			"rule_id":      rule.ID,
		})

	case model.ActionWipe:
		h.publishEvent("command.dispatch", map[string]interface{}{
			"device_id":    deviceID,
			"org_id":       orgID,
			"command_type": "WIPE",
			"source":       "compliance",
			"rule_id":      rule.ID,
		})

	case model.ActionRestrict:
		var actionCfg model.ActionConfig
		if rule.ActionConfig != nil {
			json.Unmarshal(rule.ActionConfig, &actionCfg)
		}
		h.publishEvent("command.dispatch", map[string]interface{}{
			"device_id":          deviceID,
			"org_id":             orgID,
			"command_type":       "SET_POLICY",
			"source":             "compliance",
			"rule_id":            rule.ID,
			"restriction_policy": actionCfg.RestrictionPolicy,
		})

	case model.ActionNotify:
		var actionCfg model.ActionConfig
		if rule.ActionConfig != nil {
			json.Unmarshal(rule.ActionConfig, &actionCfg)
		}
		msg := actionCfg.Message
		if msg == "" {
			msg = "Your device is not compliant with organization policy."
		}
		h.publishEvent("notification.send", map[string]interface{}{
			"device_id": deviceID,
			"org_id":    orgID,
			"type":      "compliance_violation",
			"message":   msg,
			"rule_id":   rule.ID,
		})
	}

	slog.Info("dispatched compliance action", "action", rule.Action, "rule_id", rule.ID, "device_id", deviceID)
}

func (h *ComplianceHandler) hasActiveViolation(violations []*model.ComplianceViolation, ruleID uuid.UUID) bool {
	for _, v := range violations {
		if v.RuleID == ruleID && v.Status == model.ViolationStatusActive {
			return true
		}
	}
	return false
}

func (h *ComplianceHandler) GetViolations(ctx context.Context, orgID, deviceID uuid.UUID) ([]*model.ComplianceViolation, error) {
	return h.repo.GetViolationsByDevice(ctx, orgID, deviceID)
}

func (h *ComplianceHandler) CreateRule(ctx context.Context, rule *model.ComplianceRule) error {
	return h.repo.CreateRule(ctx, rule)
}

func (h *ComplianceHandler) UpdateRule(ctx context.Context, rule *model.ComplianceRule) error {
	return h.repo.UpdateRule(ctx, rule)
}

func (h *ComplianceHandler) publishEvent(subject string, data interface{}) {
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
