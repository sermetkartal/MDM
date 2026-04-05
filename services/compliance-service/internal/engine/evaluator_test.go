package engine

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/model"
)

func makeRule(name string, conditionJSON string, severity model.Severity) *model.ComplianceRule {
	return &model.ComplianceRule{
		ID:        uuid.New(),
		OrgID:     uuid.New(),
		Name:      name,
		Condition: json.RawMessage(conditionJSON),
		Severity:  severity,
		Action:    model.ActionAlert,
		IsActive:  true,
	}
}

func TestEvaluateSimpleRule(t *testing.T) {
	e := NewEvaluator()
	rule := makeRule("os-check", `{"field":"os_version","operator":"gte","value":"13.0"}`, model.SeverityHigh)

	state := map[string]interface{}{
		"os_version": "14.0",
	}

	compliant, err := e.Evaluate(rule, state)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !compliant {
		t.Error("expected device to be compliant with os_version 14.0 >= 13.0")
	}
}

func TestEvaluateSimpleRule_Violation(t *testing.T) {
	e := NewEvaluator()
	rule := makeRule("os-check", `{"field":"os_version","operator":"gte","value":"14.0"}`, model.SeverityHigh)

	state := map[string]interface{}{
		"os_version": "13.2",
	}

	compliant, err := e.Evaluate(rule, state)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if compliant {
		t.Error("expected device to violate rule: os_version 13.2 < 14.0")
	}
}

func TestCompoundAND(t *testing.T) {
	e := NewEvaluator()
	rule := makeRule("compound-and",
		`{"operator":"and","conditions":[{"field":"os_version","operator":"gte","value":"13.0"},{"field":"is_encrypted","operator":"bool_eq","value":"true"}]}`,
		model.SeverityMedium,
	)

	// Both conditions met
	state := map[string]interface{}{
		"os_version":   "14.0",
		"is_encrypted": true,
	}
	compliant, err := e.Evaluate(rule, state)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !compliant {
		t.Error("expected compliant when both AND conditions are met")
	}

	// One condition fails
	state["is_encrypted"] = false
	compliant, err = e.Evaluate(rule, state)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if compliant {
		t.Error("expected non-compliant when one AND condition fails")
	}
}

func TestCompoundOR(t *testing.T) {
	e := NewEvaluator()
	rule := makeRule("compound-or",
		`{"operator":"or","conditions":[{"field":"os_version","operator":"gte","value":"14.0"},{"field":"agent_version","operator":"gte","value":"2.0"}]}`,
		model.SeverityLow,
	)

	// Only first condition met
	state := map[string]interface{}{
		"os_version":    "14.0",
		"agent_version": "1.5",
	}
	compliant, err := e.Evaluate(rule, state)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !compliant {
		t.Error("expected compliant when at least one OR condition is met")
	}

	// Neither condition met
	state["os_version"] = "12.0"
	compliant, err = e.Evaluate(rule, state)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if compliant {
		t.Error("expected non-compliant when no OR condition is met")
	}
}

func TestVersionComparison(t *testing.T) {
	e := NewEvaluator()

	tests := []struct {
		name      string
		condition string
		value     string
		want      bool
	}{
		{"14.0 >= 13.0", `{"field":"os_version","operator":"gte","value":"13.0"}`, "14.0", true},
		{"13.2.1 < 14.0", `{"field":"os_version","operator":"lt","value":"14.0"}`, "13.2.1", true},
		{"14.0.0 == 14.0", `{"field":"os_version","operator":"eq","value":"14.0"}`, "14.0.0", true},
		{"13.0 != 14.0", `{"field":"os_version","operator":"neq","value":"14.0"}`, "13.0", true},
		{"14.1 > 14.0", `{"field":"os_version","operator":"gt","value":"14.0"}`, "14.1", true},
		{"14.0 <= 14.0", `{"field":"os_version","operator":"lte","value":"14.0"}`, "14.0", true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rule := makeRule("version-test", tc.condition, model.SeverityLow)
			state := map[string]interface{}{"os_version": tc.value}
			compliant, err := e.Evaluate(rule, state)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if compliant != tc.want {
				t.Errorf("expected compliant=%v, got %v", tc.want, compliant)
			}
		})
	}
}

func TestRegexOperator(t *testing.T) {
	e := NewEvaluator()
	rule := makeRule("regex-check",
		`{"field":"model","operator":"regex","value":"^Pixel\\s\\d+"}`,
		model.SeverityLow,
	)

	// Match
	state := map[string]interface{}{"model": "Pixel 8 Pro"}
	compliant, err := e.Evaluate(rule, state)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !compliant {
		t.Error("expected Pixel 8 Pro to match regex ^Pixel\\s\\d+")
	}

	// No match
	state["model"] = "Galaxy S24"
	compliant, err = e.Evaluate(rule, state)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if compliant {
		t.Error("expected Galaxy S24 to NOT match regex ^Pixel\\s\\d+")
	}
}

func TestNoViolation_AllRulesPass(t *testing.T) {
	e := NewEvaluator()

	rules := []*model.ComplianceRule{
		makeRule("os-check", `{"field":"os_version","operator":"gte","value":"13.0"}`, model.SeverityHigh),
		makeRule("encrypt-check", `{"field":"is_encrypted","operator":"bool_eq","value":"true"}`, model.SeverityMedium),
		makeRule("battery-check", `{"field":"battery_level","operator":"gte","value":"20"}`, model.SeverityLow),
	}

	state := map[string]interface{}{
		"os_version":    "14.0",
		"is_encrypted":  true,
		"battery_level": 85,
	}

	violations := e.EvaluateDevice(state, rules)
	if len(violations) != 0 {
		t.Errorf("expected no violations, got %d: %+v", len(violations), violations)
	}
}

func TestEvaluateDevice_MultipleViolations(t *testing.T) {
	e := NewEvaluator()

	rules := []*model.ComplianceRule{
		makeRule("os-check", `{"field":"os_version","operator":"gte","value":"14.0"}`, model.SeverityHigh),
		makeRule("encrypt-check", `{"field":"is_encrypted","operator":"bool_eq","value":"true"}`, model.SeverityCritical),
	}

	state := map[string]interface{}{
		"os_version":   "12.0",
		"is_encrypted": false,
	}

	violations := e.EvaluateDevice(state, rules)
	if len(violations) != 2 {
		t.Errorf("expected 2 violations, got %d", len(violations))
	}
}

func TestEvaluate_InactiveRuleSkipped(t *testing.T) {
	e := NewEvaluator()

	rule := makeRule("inactive", `{"field":"os_version","operator":"gte","value":"99.0"}`, model.SeverityHigh)
	rule.IsActive = false

	state := map[string]interface{}{"os_version": "14.0"}

	violations := e.EvaluateDevice(state, []*model.ComplianceRule{rule})
	if len(violations) != 0 {
		t.Error("inactive rules should be skipped")
	}
}

func TestEvaluate_MissingFieldNonCompliant(t *testing.T) {
	e := NewEvaluator()

	rule := makeRule("missing-field", `{"field":"nonexistent_field","operator":"eq","value":"something"}`, model.SeverityLow)
	state := map[string]interface{}{"os_version": "14.0"}

	compliant, err := e.Evaluate(rule, state)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if compliant {
		t.Error("missing field should be treated as non-compliant")
	}
}
