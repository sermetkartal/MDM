package engine

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/sermetkartal/mdm/services/compliance-service/internal/model"
)

// Evaluator checks device state against compliance rule conditions.
type Evaluator struct{}

func NewEvaluator() *Evaluator {
	return &Evaluator{}
}

// EvaluateDevice checks a device state against a set of rules and returns violations.
func (e *Evaluator) EvaluateDevice(deviceState map[string]interface{}, rules []*model.ComplianceRule) []model.ComplianceRule {
	var violated []model.ComplianceRule
	for _, rule := range rules {
		if !rule.IsActive {
			continue
		}
		compliant, err := e.Evaluate(rule, deviceState)
		if err != nil {
			continue
		}
		if !compliant {
			violated = append(violated, *rule)
		}
	}
	return violated
}

// Evaluate checks whether a device state map satisfies a rule's condition.
// Returns true if the device is compliant (condition is NOT violated).
func (e *Evaluator) Evaluate(rule *model.ComplianceRule, deviceState map[string]interface{}) (bool, error) {
	var condition model.RuleCondition
	if err := json.Unmarshal(rule.Condition, &condition); err != nil {
		// Try array of conditions (AND logic)
		var conditions []model.RuleCondition
		if err2 := json.Unmarshal(rule.Condition, &conditions); err2 != nil {
			return false, fmt.Errorf("invalid condition format: %w", err)
		}
		for _, c := range conditions {
			compliant, err := e.evaluateCondition(c, deviceState)
			if err != nil {
				return false, err
			}
			if !compliant {
				return false, nil
			}
		}
		return true, nil
	}

	return e.evaluateCondition(condition, deviceState)
}

func (e *Evaluator) evaluateCondition(cond model.RuleCondition, state map[string]interface{}) (bool, error) {
	// Handle compound conditions (and/or)
	if cond.IsCompound() {
		return e.evaluateCompound(cond, state)
	}

	val, ok := state[cond.Field]
	if !ok {
		return false, nil // missing field treated as non-compliant
	}

	// Use version comparison for os_version and agent_version fields
	if cond.Field == "os_version" || cond.Field == "agent_version" {
		return e.evaluateVersionCondition(val, cond)
	}

	switch cond.Operator {
	case "eq":
		return fmt.Sprintf("%v", val) == cond.Value, nil
	case "neq":
		return fmt.Sprintf("%v", val) != cond.Value, nil
	case "gt":
		return compareNumeric(val, cond.Value, func(a, b float64) bool { return a > b })
	case "gte":
		return compareNumeric(val, cond.Value, func(a, b float64) bool { return a >= b })
	case "lt":
		return compareNumeric(val, cond.Value, func(a, b float64) bool { return a < b })
	case "lte":
		return compareNumeric(val, cond.Value, func(a, b float64) bool { return a <= b })
	case "contains":
		return strings.Contains(fmt.Sprintf("%v", val), cond.Value), nil
	case "not_contains":
		return !strings.Contains(fmt.Sprintf("%v", val), cond.Value), nil
	case "in":
		return stringInList(fmt.Sprintf("%v", val), cond.Value), nil
	case "regex":
		return matchRegex(fmt.Sprintf("%v", val), cond.Value)
	case "bool_eq":
		boolVal, _ := strconv.ParseBool(fmt.Sprintf("%v", val))
		expected, _ := strconv.ParseBool(cond.Value)
		return boolVal == expected, nil
	default:
		return false, fmt.Errorf("unknown operator: %s", cond.Operator)
	}
}

func (e *Evaluator) evaluateCompound(cond model.RuleCondition, state map[string]interface{}) (bool, error) {
	if len(cond.Conditions) == 0 {
		return true, nil
	}

	switch cond.Operator {
	case "and":
		for _, sub := range cond.Conditions {
			ok, err := e.evaluateCondition(sub, state)
			if err != nil {
				return false, err
			}
			if !ok {
				return false, nil
			}
		}
		return true, nil
	case "or":
		for _, sub := range cond.Conditions {
			ok, err := e.evaluateCondition(sub, state)
			if err != nil {
				return false, err
			}
			if ok {
				return true, nil
			}
		}
		return false, nil
	default:
		return false, fmt.Errorf("unknown compound operator: %s", cond.Operator)
	}
}

// evaluateVersionCondition compares semantic version strings (e.g., "14.0" > "13.2.1").
func (e *Evaluator) evaluateVersionCondition(val interface{}, cond model.RuleCondition) (bool, error) {
	valStr := fmt.Sprintf("%v", val)
	cmp := compareVersions(valStr, cond.Value)

	switch cond.Operator {
	case "eq":
		return cmp == 0, nil
	case "neq":
		return cmp != 0, nil
	case "gt":
		return cmp > 0, nil
	case "gte":
		return cmp >= 0, nil
	case "lt":
		return cmp < 0, nil
	case "lte":
		return cmp <= 0, nil
	default:
		// Fall back to string-based evaluation for non-comparison operators
		switch cond.Operator {
		case "contains":
			return strings.Contains(valStr, cond.Value), nil
		case "regex":
			return matchRegex(valStr, cond.Value)
		default:
			return false, fmt.Errorf("unsupported operator for version field: %s", cond.Operator)
		}
	}
}

// compareVersions compares two version strings. Returns -1, 0, or 1.
func compareVersions(a, b string) int {
	aParts := strings.Split(a, ".")
	bParts := strings.Split(b, ".")

	maxLen := len(aParts)
	if len(bParts) > maxLen {
		maxLen = len(bParts)
	}

	for i := 0; i < maxLen; i++ {
		var aNum, bNum int
		if i < len(aParts) {
			aNum, _ = strconv.Atoi(aParts[i])
		}
		if i < len(bParts) {
			bNum, _ = strconv.Atoi(bParts[i])
		}
		if aNum < bNum {
			return -1
		}
		if aNum > bNum {
			return 1
		}
	}
	return 0
}

func matchRegex(val, pattern string) (bool, error) {
	re, err := regexp.Compile(pattern)
	if err != nil {
		return false, fmt.Errorf("invalid regex pattern: %w", err)
	}
	return re.MatchString(val), nil
}

func compareNumeric(val interface{}, target string, cmp func(float64, float64) bool) (bool, error) {
	a, err := toFloat64(val)
	if err != nil {
		return false, err
	}
	b, err := strconv.ParseFloat(target, 64)
	if err != nil {
		return false, fmt.Errorf("invalid numeric target: %s", target)
	}
	return cmp(a, b), nil
}

func toFloat64(v interface{}) (float64, error) {
	switch n := v.(type) {
	case float64:
		return n, nil
	case float32:
		return float64(n), nil
	case int:
		return float64(n), nil
	case int32:
		return float64(n), nil
	case int64:
		return float64(n), nil
	case string:
		return strconv.ParseFloat(n, 64)
	case json.Number:
		return n.Float64()
	default:
		return 0, fmt.Errorf("cannot convert %T to float64", v)
	}
}

func stringInList(val, commaSeparated string) bool {
	for _, item := range strings.Split(commaSeparated, ",") {
		if strings.TrimSpace(item) == val {
			return true
		}
	}
	return false
}
