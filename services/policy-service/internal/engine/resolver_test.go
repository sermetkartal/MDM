package engine

import (
	"testing"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/policy-service/internal/model"
)

func makePolicy(name string, ptype model.PolicyType, priority int, resolution model.ConflictResolution) *model.Policy {
	return &model.Policy{
		Name:               name,
		PolicyType:         ptype,
		Priority:           priority,
		ConflictResolution: resolution,
		IsActive:           true,
	}
}

func TestResolveConflicts_SinglePolicy(t *testing.T) {
	policies := []*policyWithPayload{
		{
			policy:  makePolicy("single", model.PolicyTypePasscode, 10, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{"min_password_length": 6},
			scope:   model.AssignmentTargetOrg,
		},
	}

	result := resolveConflicts(policies)
	if result == nil {
		t.Fatal("expected a resolved policy, got nil")
	}
	if result.Payload["min_password_length"] != 6 {
		t.Errorf("expected min_password_length=6, got %v", result.Payload["min_password_length"])
	}
}

func TestResolveConflicts_EmptySet(t *testing.T) {
	result := resolveConflicts(nil)
	if result != nil {
		t.Fatal("expected nil for empty policy set")
	}

	result = resolveConflicts([]*policyWithPayload{})
	if result != nil {
		t.Fatal("expected nil for empty slice")
	}
}

func TestResolveConflicts_PriorityWins(t *testing.T) {
	policies := []*policyWithPayload{
		{
			policy:  makePolicy("low-priority", model.PolicyTypePasscode, 5, ""),
			payload: map[string]interface{}{"min_password_length": 4},
			scope:   model.AssignmentTargetOrg,
		},
		{
			policy:  makePolicy("high-priority", model.PolicyTypePasscode, 20, ""),
			payload: map[string]interface{}{"min_password_length": 8},
			scope:   model.AssignmentTargetOrg,
		},
	}

	result := resolveConflicts(policies)
	if result == nil {
		t.Fatal("expected result")
	}
	if result.Policy.Name != "high-priority" {
		t.Errorf("expected high-priority policy to win, got %s", result.Policy.Name)
	}
	if result.Payload["min_password_length"] != 8 {
		t.Errorf("expected min_password_length=8, got %v", result.Payload["min_password_length"])
	}
}

func TestResolveConflicts_ScopeTiebreaker(t *testing.T) {
	// Same priority: device scope should win over org scope
	policies := []*policyWithPayload{
		{
			policy:  makePolicy("org-policy", model.PolicyTypePasscode, 10, ""),
			payload: map[string]interface{}{"min_password_length": 4},
			scope:   model.AssignmentTargetOrg,
		},
		{
			policy:  makePolicy("device-policy", model.PolicyTypePasscode, 10, ""),
			payload: map[string]interface{}{"min_password_length": 8},
			scope:   model.AssignmentTargetDevice,
		},
	}

	result := resolveConflicts(policies)
	if result == nil {
		t.Fatal("expected result")
	}
	if result.Policy.Name != "device-policy" {
		t.Errorf("expected device-policy to win on scope tiebreak, got %s", result.Policy.Name)
	}
}

func TestMergeRestrictive_BooleanTrueWins(t *testing.T) {
	policies := []*policyWithPayload{
		{
			policy:  makePolicy("org", model.PolicyTypeRestrictions, 10, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{"camera_disabled": false, "usb_disabled": true},
			scope:   model.AssignmentTargetOrg,
		},
		{
			policy:  makePolicy("group", model.PolicyTypeRestrictions, 5, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{"camera_disabled": true, "usb_disabled": false},
			scope:   model.AssignmentTargetGroup,
		},
	}

	result := resolveConflicts(policies)
	if result == nil {
		t.Fatal("expected result")
	}

	// Both booleans should be true (most restrictive)
	if result.Payload["camera_disabled"] != true {
		t.Errorf("expected camera_disabled=true, got %v", result.Payload["camera_disabled"])
	}
	if result.Payload["usb_disabled"] != true {
		t.Errorf("expected usb_disabled=true, got %v", result.Payload["usb_disabled"])
	}
}

func TestMergeRestrictive_BooleanBothFalse(t *testing.T) {
	policies := []*policyWithPayload{
		{
			policy:  makePolicy("a", model.PolicyTypeRestrictions, 10, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{"camera_disabled": false},
			scope:   model.AssignmentTargetOrg,
		},
		{
			policy:  makePolicy("b", model.PolicyTypeRestrictions, 5, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{"camera_disabled": false},
			scope:   model.AssignmentTargetGroup,
		},
	}

	result := resolveConflicts(policies)
	if result.Payload["camera_disabled"] != false {
		t.Errorf("expected camera_disabled=false when both are false, got %v", result.Payload["camera_disabled"])
	}
}

func TestMergeRestrictive_NumericHighestWins(t *testing.T) {
	policies := []*policyWithPayload{
		{
			policy:  makePolicy("org", model.PolicyTypePasscode, 10, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{"min_password_length": 4, "max_failed_attempts": 10},
			scope:   model.AssignmentTargetOrg,
		},
		{
			policy:  makePolicy("group", model.PolicyTypePasscode, 5, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{"min_password_length": 8, "max_failed_attempts": 5},
			scope:   model.AssignmentTargetGroup,
		},
		{
			policy:  makePolicy("device", model.PolicyTypePasscode, 1, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{"min_password_length": 6},
			scope:   model.AssignmentTargetDevice,
		},
	}

	result := resolveConflicts(policies)
	if result == nil {
		t.Fatal("expected result")
	}

	// Highest numeric value should win
	if result.Payload["min_password_length"] != 8 {
		t.Errorf("expected min_password_length=8 (highest), got %v", result.Payload["min_password_length"])
	}
	if result.Payload["max_failed_attempts"] != 10 {
		t.Errorf("expected max_failed_attempts=10 (highest), got %v", result.Payload["max_failed_attempts"])
	}
}

func TestMergeRestrictive_EnumPasswordQuality(t *testing.T) {
	policies := []*policyWithPayload{
		{
			policy:  makePolicy("org", model.PolicyTypePasscode, 10, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{"password_quality": "numeric"},
			scope:   model.AssignmentTargetOrg,
		},
		{
			policy:  makePolicy("group", model.PolicyTypePasscode, 5, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{"password_quality": "alphanumeric"},
			scope:   model.AssignmentTargetGroup,
		},
	}

	result := resolveConflicts(policies)
	if result == nil {
		t.Fatal("expected result")
	}

	// alphanumeric is more restrictive than numeric
	if result.Payload["password_quality"] != "alphanumeric" {
		t.Errorf("expected password_quality=alphanumeric (most restrictive), got %v", result.Payload["password_quality"])
	}
}

func TestResolveConflicts_DeviceWins(t *testing.T) {
	policies := []*policyWithPayload{
		{
			policy:  makePolicy("org-policy", model.PolicyTypeWifi, 100, model.ConflictResolutionDeviceWins),
			payload: map[string]interface{}{"ssid": "corp-wifi"},
			scope:   model.AssignmentTargetOrg,
		},
		{
			policy:  makePolicy("device-policy", model.PolicyTypeWifi, 1, model.ConflictResolutionDeviceWins),
			payload: map[string]interface{}{"ssid": "lab-wifi"},
			scope:   model.AssignmentTargetDevice,
		},
	}

	result := resolveConflicts(policies)
	if result == nil {
		t.Fatal("expected result")
	}
	// Device wins regardless of priority
	if result.Payload["ssid"] != "lab-wifi" {
		t.Errorf("expected ssid=lab-wifi (device wins), got %v", result.Payload["ssid"])
	}
}

func TestResolveConflicts_OrgWins(t *testing.T) {
	policies := []*policyWithPayload{
		{
			policy:  makePolicy("org-policy", model.PolicyTypeVPN, 1, model.ConflictResolutionOrgWins),
			payload: map[string]interface{}{"vpn_server": "hq.example.com"},
			scope:   model.AssignmentTargetOrg,
		},
		{
			policy:  makePolicy("device-policy", model.PolicyTypeVPN, 100, model.ConflictResolutionOrgWins),
			payload: map[string]interface{}{"vpn_server": "local.example.com"},
			scope:   model.AssignmentTargetDevice,
		},
	}

	result := resolveConflicts(policies)
	if result == nil {
		t.Fatal("expected result")
	}
	if result.Payload["vpn_server"] != "hq.example.com" {
		t.Errorf("expected vpn_server=hq.example.com (org wins), got %v", result.Payload["vpn_server"])
	}
}

func TestResolveConflicts_MultiLevelInheritance(t *testing.T) {
	// org -> group -> device with most_restrictive merge
	policies := []*policyWithPayload{
		{
			policy: makePolicy("org-baseline", model.PolicyTypeRestrictions, 1, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{
				"camera_disabled":    false,
				"usb_disabled":       false,
				"bluetooth_disabled": true,
				"min_password_length": 4,
			},
			scope: model.AssignmentTargetOrg,
		},
		{
			policy: makePolicy("engineering-group", model.PolicyTypeRestrictions, 5, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{
				"camera_disabled":    false,
				"usb_disabled":       true,
				"min_password_length": 8,
			},
			scope: model.AssignmentTargetGroup,
		},
		{
			policy: makePolicy("secure-device", model.PolicyTypeRestrictions, 10, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{
				"camera_disabled":    true,
				"min_password_length": 6,
			},
			scope: model.AssignmentTargetDevice,
		},
	}

	result := resolveConflicts(policies)
	if result == nil {
		t.Fatal("expected result")
	}

	// Booleans: true if ANY says true
	if result.Payload["camera_disabled"] != true {
		t.Errorf("expected camera_disabled=true (device sets it)")
	}
	if result.Payload["usb_disabled"] != true {
		t.Errorf("expected usb_disabled=true (group sets it)")
	}
	if result.Payload["bluetooth_disabled"] != true {
		t.Errorf("expected bluetooth_disabled=true (org sets it)")
	}
	// Numeric: highest wins
	if result.Payload["min_password_length"] != 8 {
		t.Errorf("expected min_password_length=8 (group has highest), got %v", result.Payload["min_password_length"])
	}
}

func TestPreviewEffectivePolicies_ConflictDetails(t *testing.T) {
	policies := []*policyWithPayload{
		{
			policy:  makePolicy("org", model.PolicyTypeRestrictions, 10, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{"camera_disabled": false},
			scope:   model.AssignmentTargetOrg,
		},
		{
			policy:  makePolicy("group", model.PolicyTypeRestrictions, 5, model.ConflictResolutionMostRestrictive),
			payload: map[string]interface{}{"camera_disabled": true},
			scope:   model.AssignmentTargetGroup,
		},
	}

	rp, conflicts := resolveConflictsWithDetails(policies, "restrictions")
	if rp == nil {
		t.Fatal("expected result")
	}

	if len(conflicts) == 0 {
		t.Fatal("expected conflict details")
	}

	found := false
	for _, c := range conflicts {
		if c.Key == "camera_disabled" {
			found = true
			if c.WinningValue != true {
				t.Errorf("expected winning value true, got %v", c.WinningValue)
			}
			if c.CandidateCount != 2 {
				t.Errorf("expected 2 candidates, got %d", c.CandidateCount)
			}
		}
	}
	if !found {
		t.Error("expected camera_disabled in conflict details")
	}
}

func TestScopeRank(t *testing.T) {
	if scopeRank(model.AssignmentTargetDevice) <= scopeRank(model.AssignmentTargetGroup) {
		t.Error("device scope should rank higher than group")
	}
	if scopeRank(model.AssignmentTargetGroup) <= scopeRank(model.AssignmentTargetOrg) {
		t.Error("group scope should rank higher than org")
	}
}

func TestMergeValue_NonMergeableKeepsExisting(t *testing.T) {
	// String values that aren't password_quality should keep existing
	result := mergeValue("description", "first", "second")
	if result != "first" {
		t.Errorf("expected non-mergeable to keep existing, got %v", result)
	}
}

func TestUniqueIDs(t *testing.T) {
	id1 := [16]byte{1}
	id2 := [16]byte{2}
	ids := uniqueIDs([]uuid.UUID{id1, id2, id1, id2, id1})
	if len(ids) != 2 {
		t.Errorf("expected 2 unique IDs, got %d", len(ids))
	}
}
