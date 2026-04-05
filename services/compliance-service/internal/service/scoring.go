package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/model"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/repository"
)

// ScoringService calculates compliance scores for devices and organizations.
type ScoringService struct {
	repo *repository.ComplianceRepository
}

func NewScoringService(repo *repository.ComplianceRepository) *ScoringService {
	return &ScoringService{repo: repo}
}

// CalculateDeviceScore returns a compliance score (0-100) for a single device.
// 100 = fully compliant (no active violations), 0 = has violations relative to total rules.
func (s *ScoringService) CalculateDeviceScore(ctx context.Context, orgID, deviceID uuid.UUID) (float64, error) {
	rules, err := s.repo.ListRulesByOrg(ctx, orgID)
	if err != nil {
		return 0, err
	}
	if len(rules) == 0 {
		return 100, nil // no rules = fully compliant
	}

	violations, err := s.repo.GetActiveViolationsByDeviceAndOrg(ctx, orgID, deviceID)
	if err != nil {
		return 0, err
	}

	// Count unique violated rules
	violatedRules := make(map[uuid.UUID]bool)
	for _, v := range violations {
		violatedRules[v.RuleID] = true
	}

	compliantRules := len(rules) - len(violatedRules)
	return float64(compliantRules) / float64(len(rules)) * 100, nil
}

// CalculateOrgScore returns the org-wide compliance score.
func (s *ScoringService) CalculateOrgScore(ctx context.Context, orgID uuid.UUID) (*model.ComplianceScore, error) {
	return s.repo.CountDevicesByComplianceState(ctx, orgID)
}
