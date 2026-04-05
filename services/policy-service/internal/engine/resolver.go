package engine

import (
	"context"
	"fmt"
	"log/slog"
	"sort"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/policy-service/internal/model"
	"github.com/sermetkartal/mdm/services/policy-service/internal/repository"
)

// Resolver computes effective policies for a device by resolving the
// inheritance chain: org -> group -> device. Policies at a more specific
// scope override broader ones, subject to conflict resolution rules.
type Resolver struct {
	repo *repository.PolicyRepository
}

func NewResolver(repo *repository.PolicyRepository) *Resolver {
	return &Resolver{repo: repo}
}

// ResolvedPolicy contains a policy and its resolved payload after conflict resolution.
type ResolvedPolicy struct {
	Policy  *model.Policy          `json:"policy"`
	Payload map[string]interface{} `json:"payload"`
}

// ConflictDetail describes which policy won for a specific key and why.
type ConflictDetail struct {
	Key            string      `json:"key"`
	WinningValue   interface{} `json:"winning_value"`
	WinningPolicy  string      `json:"winning_policy"`
	WinningScope   string      `json:"winning_scope"`
	Reason         string      `json:"reason"`
	CandidateCount int         `json:"candidate_count"`
}

// PreviewResult contains the resolved policies along with conflict resolution details.
type PreviewResult struct {
	Resolved  []ResolvedPolicy `json:"resolved_policies"`
	Conflicts []ConflictDetail `json:"conflicts"`
}

// GetEffectivePolicies returns the resolved set of policies that apply to a device,
// walking the inheritance chain: org -> groups -> device.
func (r *Resolver) GetEffectivePolicies(ctx context.Context, orgID, deviceID uuid.UUID, groupIDs []uuid.UUID) ([]ResolvedPolicy, error) {
	policiesByType, err := r.collectPoliciesByType(ctx, orgID, deviceID, groupIDs)
	if err != nil {
		return nil, err
	}

	var resolved []ResolvedPolicy
	for _, policies := range policiesByType {
		rp := resolveConflicts(policies)
		if rp != nil {
			resolved = append(resolved, *rp)
		}
	}

	return resolved, nil
}

// PreviewEffectivePolicies resolves what policies would apply to a device
// without persisting anything, including conflict resolution details.
func (r *Resolver) PreviewEffectivePolicies(ctx context.Context, orgID, deviceID uuid.UUID, groupIDs []uuid.UUID) (*PreviewResult, error) {
	policiesByType, err := r.collectPoliciesByType(ctx, orgID, deviceID, groupIDs)
	if err != nil {
		return nil, err
	}

	result := &PreviewResult{}
	for policyType, policies := range policiesByType {
		rp, conflicts := resolveConflictsWithDetails(policies, string(policyType))
		if rp != nil {
			result.Resolved = append(result.Resolved, *rp)
		}
		result.Conflicts = append(result.Conflicts, conflicts...)
	}

	return result, nil
}

// collectPoliciesByType gathers all policies assigned to a device through the
// inheritance chain and groups them by policy type.
func (r *Resolver) collectPoliciesByType(ctx context.Context, orgID, deviceID uuid.UUID, groupIDs []uuid.UUID) (map[model.PolicyType][]*policyWithPayload, error) {
	orgAssignments, err := r.repo.GetAssignmentsByTarget(ctx, model.AssignmentTargetOrg, orgID)
	if err != nil {
		return nil, err
	}

	var groupAssignments []model.PolicyAssignment
	for _, gid := range groupIDs {
		ga, err := r.repo.GetAssignmentsByTarget(ctx, model.AssignmentTargetGroup, gid)
		if err != nil {
			return nil, err
		}
		groupAssignments = append(groupAssignments, ga...)
	}

	deviceAssignments, err := r.repo.GetAssignmentsByTarget(ctx, model.AssignmentTargetDevice, deviceID)
	if err != nil {
		return nil, err
	}

	policyScopes := make(map[uuid.UUID]model.AssignmentTarget)
	var allPolicyIDs []uuid.UUID

	for _, a := range orgAssignments {
		policyScopes[a.PolicyID] = model.AssignmentTargetOrg
		allPolicyIDs = append(allPolicyIDs, a.PolicyID)
	}
	for _, a := range groupAssignments {
		policyScopes[a.PolicyID] = model.AssignmentTargetGroup
		allPolicyIDs = append(allPolicyIDs, a.PolicyID)
	}
	for _, a := range deviceAssignments {
		policyScopes[a.PolicyID] = model.AssignmentTargetDevice
		allPolicyIDs = append(allPolicyIDs, a.PolicyID)
	}

	policiesByType := make(map[model.PolicyType][]*policyWithPayload)

	for _, pid := range uniqueIDs(allPolicyIDs) {
		policy, err := r.repo.GetByID(ctx, pid)
		if err != nil {
			slog.Warn("skipping policy", "policy_id", pid, "error", err)
			continue
		}
		if !policy.IsActive {
			continue
		}

		version, err := r.repo.GetLatestVersion(ctx, pid)
		if err != nil {
			slog.Warn("skipping policy without version", "policy_id", pid, "error", err)
			continue
		}

		policiesByType[policy.PolicyType] = append(policiesByType[policy.PolicyType], &policyWithPayload{
			policy:  policy,
			payload: version.Payload,
			scope:   policyScopes[pid],
		})
	}

	return policiesByType, nil
}

type policyWithPayload struct {
	policy  *model.Policy
	payload map[string]interface{}
	scope   model.AssignmentTarget
}

// resolveConflicts picks the winning policy for a given type based on conflict resolution strategy.
func resolveConflicts(policies []*policyWithPayload) *ResolvedPolicy {
	if len(policies) == 0 {
		return nil
	}
	if len(policies) == 1 {
		return &ResolvedPolicy{Policy: policies[0].policy, Payload: policies[0].payload}
	}

	sortPolicies(policies)

	resolution := policies[0].policy.ConflictResolution

	switch resolution {
	case model.ConflictResolutionMostRestrictive:
		merged := mergeRestrictive(policies)
		return &ResolvedPolicy{Policy: policies[0].policy, Payload: merged}
	case model.ConflictResolutionDeviceWins:
		for _, p := range policies {
			if p.scope == model.AssignmentTargetDevice {
				return &ResolvedPolicy{Policy: p.policy, Payload: p.payload}
			}
		}
		return &ResolvedPolicy{Policy: policies[0].policy, Payload: policies[0].payload}
	case model.ConflictResolutionOrgWins:
		for _, p := range policies {
			if p.scope == model.AssignmentTargetOrg {
				return &ResolvedPolicy{Policy: p.policy, Payload: p.payload}
			}
		}
		return &ResolvedPolicy{Policy: policies[0].policy, Payload: policies[0].payload}
	default:
		// Priority-based: highest priority wins (already sorted)
		return &ResolvedPolicy{Policy: policies[0].policy, Payload: policies[0].payload}
	}
}

// resolveConflictsWithDetails does the same as resolveConflicts but also tracks
// which policy won for each key and why.
func resolveConflictsWithDetails(policies []*policyWithPayload, policyType string) (*ResolvedPolicy, []ConflictDetail) {
	if len(policies) == 0 {
		return nil, nil
	}
	if len(policies) == 1 {
		var conflicts []ConflictDetail
		for k, v := range policies[0].payload {
			conflicts = append(conflicts, ConflictDetail{
				Key:            k,
				WinningValue:   v,
				WinningPolicy:  policies[0].policy.Name,
				WinningScope:   string(policies[0].scope),
				Reason:         "only policy",
				CandidateCount: 1,
			})
		}
		return &ResolvedPolicy{Policy: policies[0].policy, Payload: policies[0].payload}, conflicts
	}

	sortPolicies(policies)
	resolution := policies[0].policy.ConflictResolution

	switch resolution {
	case model.ConflictResolutionMostRestrictive:
		merged, conflicts := mergeRestrictiveWithDetails(policies)
		return &ResolvedPolicy{Policy: policies[0].policy, Payload: merged}, conflicts
	case model.ConflictResolutionDeviceWins:
		winner := policies[0]
		reason := "highest priority"
		for _, p := range policies {
			if p.scope == model.AssignmentTargetDevice {
				winner = p
				reason = "device-level policy wins"
				break
			}
		}
		var conflicts []ConflictDetail
		for k, v := range winner.payload {
			conflicts = append(conflicts, ConflictDetail{
				Key:            k,
				WinningValue:   v,
				WinningPolicy:  winner.policy.Name,
				WinningScope:   string(winner.scope),
				Reason:         reason,
				CandidateCount: len(policies),
			})
		}
		return &ResolvedPolicy{Policy: winner.policy, Payload: winner.payload}, conflicts
	case model.ConflictResolutionOrgWins:
		winner := policies[0]
		reason := "highest priority"
		for _, p := range policies {
			if p.scope == model.AssignmentTargetOrg {
				winner = p
				reason = "org-level policy wins"
				break
			}
		}
		var conflicts []ConflictDetail
		for k, v := range winner.payload {
			conflicts = append(conflicts, ConflictDetail{
				Key:            k,
				WinningValue:   v,
				WinningPolicy:  winner.policy.Name,
				WinningScope:   string(winner.scope),
				Reason:         reason,
				CandidateCount: len(policies),
			})
		}
		return &ResolvedPolicy{Policy: winner.policy, Payload: winner.payload}, conflicts
	default:
		var conflicts []ConflictDetail
		for k, v := range policies[0].payload {
			conflicts = append(conflicts, ConflictDetail{
				Key:            k,
				WinningValue:   v,
				WinningPolicy:  policies[0].policy.Name,
				WinningScope:   string(policies[0].scope),
				Reason:         fmt.Sprintf("highest priority (%d)", policies[0].policy.Priority),
				CandidateCount: len(policies),
			})
		}
		return &ResolvedPolicy{Policy: policies[0].policy, Payload: policies[0].payload}, conflicts
	}
}

func sortPolicies(policies []*policyWithPayload) {
	sort.Slice(policies, func(i, j int) bool {
		if policies[i].policy.Priority != policies[j].policy.Priority {
			return policies[i].policy.Priority > policies[j].policy.Priority
		}
		return scopeRank(policies[i].scope) > scopeRank(policies[j].scope)
	})
}

// Password quality levels ordered from least to most restrictive.
var passwordQualityRank = map[string]int{
	"unspecified":      0,
	"biometric_weak":   1,
	"something":        2,
	"numeric":          3,
	"numeric_complex":  4,
	"alphabetic":       5,
	"alphanumeric":     6,
	"complex":          7,
}

// mergeRestrictive produces a union of boolean restrictions (true = restricted).
// For numeric values, picks the most restrictive (e.g., largest minimum).
// For enum values like password_quality, picks the most restrictive level.
func mergeRestrictive(policies []*policyWithPayload) map[string]interface{} {
	merged := make(map[string]interface{})

	for _, p := range policies {
		for k, v := range p.payload {
			existing, exists := merged[k]
			if !exists {
				merged[k] = v
				continue
			}

			merged[k] = mergeValue(k, existing, v)
		}
	}

	return merged
}

// mergeRestrictiveWithDetails is like mergeRestrictive but tracks conflict details.
func mergeRestrictiveWithDetails(policies []*policyWithPayload) (map[string]interface{}, []ConflictDetail) {
	merged := make(map[string]interface{})
	// Track which policy set each key's winning value
	winners := make(map[string]*policyWithPayload)

	for _, p := range policies {
		for k, v := range p.payload {
			existing, exists := merged[k]
			if !exists {
				merged[k] = v
				winners[k] = p
				continue
			}

			newVal := mergeValue(k, existing, v)
			if newVal != existing {
				merged[k] = newVal
				winners[k] = p
			}
		}
	}

	// Count candidates per key
	keyCounts := make(map[string]int)
	for _, p := range policies {
		for k := range p.payload {
			keyCounts[k]++
		}
	}

	var conflicts []ConflictDetail
	for k, v := range merged {
		w := winners[k]
		reason := "most restrictive value"
		if keyCounts[k] == 1 {
			reason = "only source"
		}
		conflicts = append(conflicts, ConflictDetail{
			Key:            k,
			WinningValue:   v,
			WinningPolicy:  w.policy.Name,
			WinningScope:   string(w.scope),
			Reason:         reason,
			CandidateCount: keyCounts[k],
		})
	}

	return merged, conflicts
}

// mergeValue merges two values for the same key using most-restrictive-wins logic.
func mergeValue(key string, existing, incoming interface{}) interface{} {
	// Boolean: true (restricted) wins
	if bv, ok := incoming.(bool); ok {
		if ebv, ok := existing.(bool); ok {
			if bv || ebv {
				return true
			}
			return false
		}
	}

	// Numeric: higher value wins (more restrictive minimums)
	if nv, ok := toFloat64(incoming); ok {
		if env, ok := toFloat64(existing); ok {
			if nv > env {
				return incoming
			}
			return existing
		}
	}

	// Enum: password_quality — most restrictive wins
	if sv, ok := incoming.(string); ok {
		if esv, ok := existing.(string); ok {
			if isPasswordQualityField(key) {
				if passwordQualityRank[sv] > passwordQualityRank[esv] {
					return sv
				}
				return esv
			}
		}
	}

	// Non-mergeable: keep existing (first seen / higher priority)
	return existing
}

func isPasswordQualityField(key string) bool {
	return key == "password_quality" || key == "passcode_quality"
}

func toFloat64(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	default:
		return 0, false
	}
}

func scopeRank(scope model.AssignmentTarget) int {
	switch scope {
	case model.AssignmentTargetDevice:
		return 3
	case model.AssignmentTargetGroup:
		return 2
	case model.AssignmentTargetOrg:
		return 1
	default:
		return 0
	}
}

func uniqueIDs(ids []uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]bool)
	var result []uuid.UUID
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	return result
}
