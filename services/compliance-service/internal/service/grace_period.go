package service

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/model"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/repository"
)

// GracePeriodChecker runs periodically to check for violations past their grace period
// and executes the deferred action.
type GracePeriodChecker struct {
	repo     *repository.ComplianceRepository
	nc       *nats.Conn
	interval time.Duration
	stopCh   chan struct{}
}

func NewGracePeriodChecker(repo *repository.ComplianceRepository, nc *nats.Conn, interval time.Duration) *GracePeriodChecker {
	return &GracePeriodChecker{
		repo:     repo,
		nc:       nc,
		interval: interval,
		stopCh:   make(chan struct{}),
	}
}

// Start begins the periodic grace period check loop.
func (g *GracePeriodChecker) Start() {
	go func() {
		ticker := time.NewTicker(g.interval)
		defer ticker.Stop()

		slog.Info("grace period checker started", "interval", g.interval)
		for {
			select {
			case <-ticker.C:
				g.check()
			case <-g.stopCh:
				slog.Info("grace period checker stopped")
				return
			}
		}
	}()
}

// Stop halts the grace period checker.
func (g *GracePeriodChecker) Stop() {
	close(g.stopCh)
}

func (g *GracePeriodChecker) check() {
	ctx := context.Background()
	violations, err := g.repo.GetViolationsPastGracePeriod(ctx)
	if err != nil {
		slog.Error("failed to get violations past grace period", "error", err)
		return
	}

	for _, v := range violations {
		rule, err := g.repo.GetRuleByID(ctx, v.RuleID)
		if err != nil {
			slog.Error("failed to get rule for grace period violation", "rule_id", v.RuleID, "error", err)
			continue
		}

		slog.Info("executing deferred action for violation past grace period",
			"violation_id", v.ID, "rule_id", rule.ID, "action", rule.Action, "device_id", v.DeviceID)

		g.executeAction(rule, v)
	}
}

func (g *GracePeriodChecker) executeAction(rule *model.ComplianceRule, violation *model.ComplianceViolation) {
	basePayload := map[string]interface{}{
		"device_id": violation.DeviceID,
		"org_id":    violation.OrgID,
		"rule_id":   rule.ID,
		"severity":  rule.Severity,
		"source":    "compliance_grace_period",
	}

	switch rule.Action {
	case model.ActionAlert:
		g.publishEvent("compliance.violated", basePayload)
	case model.ActionLock:
		basePayload["command_type"] = "LOCK"
		g.publishEvent("command.dispatch", basePayload)
	case model.ActionWipe:
		basePayload["command_type"] = "WIPE"
		g.publishEvent("command.dispatch", basePayload)
	case model.ActionRestrict:
		basePayload["command_type"] = "SET_POLICY"
		g.publishEvent("command.dispatch", basePayload)
	case model.ActionNotify:
		g.publishEvent("notification.send", basePayload)
	}
}

func (g *GracePeriodChecker) publishEvent(subject string, data interface{}) {
	if g.nc == nil {
		return
	}
	payload, err := json.Marshal(data)
	if err != nil {
		slog.Error("failed to marshal event", "subject", subject, "error", err)
		return
	}
	if err := g.nc.Publish(subject, payload); err != nil {
		slog.Error("failed to publish event", "subject", subject, "error", err)
	}
}
