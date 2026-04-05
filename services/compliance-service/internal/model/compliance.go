package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Severity string

const (
	SeverityLow      Severity = "low"
	SeverityMedium   Severity = "medium"
	SeverityHigh     Severity = "high"
	SeverityCritical Severity = "critical"
)

type Action string

const (
	ActionAlert    Action = "alert"
	ActionRestrict Action = "restrict"
	ActionWipe     Action = "wipe"
	ActionLock     Action = "lock"
	ActionNotify   Action = "notify"
)

type ViolationStatus string

const (
	ViolationStatusActive    ViolationStatus = "active"
	ViolationStatusResolved  ViolationStatus = "resolved"
	ViolationStatusDismissed ViolationStatus = "dismissed"
)

type ComplianceRule struct {
	ID           uuid.UUID       `db:"id" json:"id"`
	OrgID        uuid.UUID       `db:"org_id" json:"org_id"`
	Name         string          `db:"name" json:"name"`
	Condition    json.RawMessage `db:"condition" json:"condition"`
	Severity     Severity        `db:"severity" json:"severity"`
	Action       Action          `db:"action" json:"action"`
	ActionConfig json.RawMessage `db:"action_config" json:"action_config,omitempty"`
	IsActive     bool            `db:"is_active" json:"is_active"`
	CreatedAt    time.Time       `db:"created_at" json:"created_at"`
	UpdatedAt    time.Time       `db:"updated_at" json:"updated_at"`
}

type ComplianceViolation struct {
	ID         uuid.UUID       `db:"id" json:"id"`
	OrgID      uuid.UUID       `db:"org_id" json:"org_id"`
	RuleID     uuid.UUID       `db:"rule_id" json:"rule_id"`
	DeviceID   uuid.UUID       `db:"device_id" json:"device_id"`
	DetectedAt time.Time       `db:"detected_at" json:"detected_at"`
	ResolvedAt *time.Time      `db:"resolved_at" json:"resolved_at,omitempty"`
	Status     ViolationStatus `db:"status" json:"status"`
	Detail     json.RawMessage `db:"detail" json:"detail,omitempty"`
	CreatedAt  time.Time       `db:"created_at" json:"created_at"`
}

type ComplianceStatus struct {
	DeviceID   uuid.UUID           `json:"device_id"`
	IsCompliant bool               `json:"is_compliant"`
	Violations  []ComplianceViolation `json:"violations"`
	EvaluatedAt time.Time          `json:"evaluated_at"`
}

// RuleCondition represents a single or compound condition to evaluate against device state.
// Simple: {"field":"os_version","operator":"lt","value":"14"}
// Compound: {"operator":"and","conditions":[...]}
type RuleCondition struct {
	Field      string          `json:"field,omitempty"`
	Operator   string          `json:"operator"`
	Value      string          `json:"value,omitempty"`
	Conditions []RuleCondition `json:"conditions,omitempty"`
}

// IsCompound returns true if this is an AND/OR compound condition.
func (c RuleCondition) IsCompound() bool {
	return c.Operator == "and" || c.Operator == "or"
}

// ActionConfig holds optional configuration for rule actions.
type ActionConfig struct {
	GracePeriodHours int    `json:"grace_period_hours,omitempty"`
	Message          string `json:"message,omitempty"`
	RestrictionPolicy string `json:"restriction_policy,omitempty"`
}

// ComplianceScore represents org-level compliance scoring.
type ComplianceScore struct {
	TotalDevices    int     `json:"total_devices"`
	Compliant       int     `json:"compliant"`
	NonCompliant    int     `json:"non_compliant"`
	Pending         int     `json:"pending"`
	ScorePercent    float64 `json:"score_percent"`
}
