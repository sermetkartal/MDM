package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/model"
)

type ComplianceRepository struct {
	db *sql.DB
}

func NewComplianceRepository(db *sql.DB) *ComplianceRepository {
	return &ComplianceRepository{db: db}
}

// Rule CRUD

func (r *ComplianceRepository) CreateRule(ctx context.Context, rule *model.ComplianceRule) error {
	rule.ID = uuid.New()
	rule.CreatedAt = time.Now()
	rule.UpdatedAt = time.Now()

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO compliance_rules (id, org_id, name, condition, severity, action, action_config, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		rule.ID, rule.OrgID, rule.Name, rule.Condition, rule.Severity,
		rule.Action, rule.ActionConfig, rule.IsActive, rule.CreatedAt, rule.UpdatedAt,
	)
	return err
}

func (r *ComplianceRepository) GetRuleByID(ctx context.Context, id uuid.UUID) (*model.ComplianceRule, error) {
	rule := &model.ComplianceRule{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, org_id, name, condition, severity, action, action_config, is_active, created_at, updated_at
		FROM compliance_rules WHERE id = $1`, id,
	).Scan(
		&rule.ID, &rule.OrgID, &rule.Name, &rule.Condition, &rule.Severity,
		&rule.Action, &rule.ActionConfig, &rule.IsActive, &rule.CreatedAt, &rule.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return rule, nil
}

func (r *ComplianceRepository) UpdateRule(ctx context.Context, rule *model.ComplianceRule) error {
	rule.UpdatedAt = time.Now()
	_, err := r.db.ExecContext(ctx, `
		UPDATE compliance_rules SET name = $2, condition = $3, severity = $4, action = $5,
			action_config = $6, is_active = $7, updated_at = $8
		WHERE id = $1`,
		rule.ID, rule.Name, rule.Condition, rule.Severity,
		rule.Action, rule.ActionConfig, rule.IsActive, rule.UpdatedAt,
	)
	return err
}

func (r *ComplianceRepository) ListRulesByOrg(ctx context.Context, orgID uuid.UUID) ([]*model.ComplianceRule, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, name, condition, severity, action, action_config, is_active, created_at, updated_at
		FROM compliance_rules WHERE org_id = $1 AND is_active = true ORDER BY created_at DESC`, orgID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []*model.ComplianceRule
	for rows.Next() {
		rule := &model.ComplianceRule{}
		if err := rows.Scan(
			&rule.ID, &rule.OrgID, &rule.Name, &rule.Condition, &rule.Severity,
			&rule.Action, &rule.ActionConfig, &rule.IsActive, &rule.CreatedAt, &rule.UpdatedAt,
		); err != nil {
			return nil, err
		}
		rules = append(rules, rule)
	}
	return rules, nil
}

// Violation CRUD

func (r *ComplianceRepository) CreateViolation(ctx context.Context, v *model.ComplianceViolation) error {
	v.ID = uuid.New()
	v.CreatedAt = time.Now()
	v.DetectedAt = time.Now()

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO compliance_violations (id, org_id, rule_id, device_id, detected_at, status, detail, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		v.ID, v.OrgID, v.RuleID, v.DeviceID, v.DetectedAt, v.Status, v.Detail, v.CreatedAt,
	)
	return err
}

func (r *ComplianceRepository) GetViolationsByDevice(ctx context.Context, orgID, deviceID uuid.UUID) ([]*model.ComplianceViolation, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, rule_id, device_id, detected_at, resolved_at, status, detail, created_at
		FROM compliance_violations WHERE org_id = $1 AND device_id = $2 ORDER BY detected_at DESC`,
		orgID, deviceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var violations []*model.ComplianceViolation
	for rows.Next() {
		v := &model.ComplianceViolation{}
		if err := rows.Scan(
			&v.ID, &v.OrgID, &v.RuleID, &v.DeviceID, &v.DetectedAt,
			&v.ResolvedAt, &v.Status, &v.Detail, &v.CreatedAt,
		); err != nil {
			return nil, err
		}
		violations = append(violations, v)
	}
	return violations, nil
}

func (r *ComplianceRepository) ResolveViolation(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	_, err := r.db.ExecContext(ctx, `
		UPDATE compliance_violations SET status = 'resolved', resolved_at = $2 WHERE id = $1`,
		id, now,
	)
	return err
}

func (r *ComplianceRepository) GetActiveViolationsByDeviceAndOrg(ctx context.Context, orgID, deviceID uuid.UUID) ([]*model.ComplianceViolation, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, rule_id, device_id, detected_at, resolved_at, status, detail, created_at
		FROM compliance_violations WHERE org_id = $1 AND device_id = $2 AND status = 'active' ORDER BY detected_at DESC`,
		orgID, deviceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var violations []*model.ComplianceViolation
	for rows.Next() {
		v := &model.ComplianceViolation{}
		if err := rows.Scan(
			&v.ID, &v.OrgID, &v.RuleID, &v.DeviceID, &v.DetectedAt,
			&v.ResolvedAt, &v.Status, &v.Detail, &v.CreatedAt,
		); err != nil {
			return nil, err
		}
		violations = append(violations, v)
	}
	return violations, nil
}

func (r *ComplianceRepository) GetViolationsPastGracePeriod(ctx context.Context) ([]*model.ComplianceViolation, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT v.id, v.org_id, v.rule_id, v.device_id, v.detected_at, v.resolved_at, v.status, v.detail, v.created_at
		FROM compliance_violations v
		JOIN compliance_rules r ON r.id = v.rule_id
		WHERE v.status = 'active'
		AND r.action_config IS NOT NULL
		AND (r.action_config->>'grace_period_hours')::int > 0
		AND v.detected_at + ((r.action_config->>'grace_period_hours')::int || ' hours')::interval < NOW()
		ORDER BY v.detected_at ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var violations []*model.ComplianceViolation
	for rows.Next() {
		v := &model.ComplianceViolation{}
		if err := rows.Scan(
			&v.ID, &v.OrgID, &v.RuleID, &v.DeviceID, &v.DetectedAt,
			&v.ResolvedAt, &v.Status, &v.Detail, &v.CreatedAt,
		); err != nil {
			return nil, err
		}
		violations = append(violations, v)
	}
	return violations, nil
}

func (r *ComplianceRepository) CountDevicesByComplianceState(ctx context.Context, orgID uuid.UUID) (*model.ComplianceScore, error) {
	score := &model.ComplianceScore{}
	err := r.db.QueryRowContext(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE compliance_state = 'compliant') AS compliant,
			COUNT(*) FILTER (WHERE compliance_state = 'non_compliant') AS non_compliant,
			COUNT(*) FILTER (WHERE compliance_state = 'pending' OR compliance_state = 'unknown') AS pending,
			COUNT(*) AS total
		FROM devices WHERE org_id = $1 AND enrollment_status = 'enrolled'`,
		orgID,
	).Scan(&score.Compliant, &score.NonCompliant, &score.Pending, &score.TotalDevices)
	if err != nil {
		return nil, err
	}
	if score.TotalDevices > 0 {
		score.ScorePercent = float64(score.Compliant) / float64(score.TotalDevices) * 100
	}
	return score, nil
}

func (r *ComplianceRepository) GetViolationCountsBySeverity(ctx context.Context, orgID uuid.UUID) (map[string]int, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT r.severity, COUNT(v.id)
		FROM compliance_violations v
		JOIN compliance_rules r ON r.id = v.rule_id
		WHERE v.org_id = $1 AND v.status = 'active'
		GROUP BY r.severity`,
		orgID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make(map[string]int)
	for rows.Next() {
		var severity string
		var cnt int
		if err := rows.Scan(&severity, &cnt); err != nil {
			return nil, err
		}
		counts[severity] = cnt
	}
	return counts, nil
}

func (r *ComplianceRepository) GetDailyComplianceScores(ctx context.Context, orgID uuid.UUID, days int) ([]map[string]interface{}, error) {
	rows, err := r.db.QueryContext(ctx, `
		WITH daily AS (
			SELECT
				date_trunc('day', d.created_at) AS day,
				COUNT(*) AS total,
				COUNT(*) FILTER (WHERE d.compliance_state = 'compliant') AS compliant
			FROM devices d
			WHERE d.org_id = $1 AND d.enrollment_status = 'enrolled'
			AND d.created_at >= NOW() - ($2 || ' days')::interval
			GROUP BY date_trunc('day', d.created_at)
		)
		SELECT day, total, compliant,
			CASE WHEN total > 0 THEN (compliant::float / total::float) * 100 ELSE 0 END AS score
		FROM daily ORDER BY day ASC`,
		orgID, days,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var day time.Time
		var total, compliant int
		var score float64
		if err := rows.Scan(&day, &total, &compliant, &score); err != nil {
			return nil, err
		}
		results = append(results, map[string]interface{}{
			"date":      day.Format("2006-01-02"),
			"total":     total,
			"compliant": compliant,
			"score":     score,
		})
	}
	return results, nil
}

func (r *ComplianceRepository) GetActiveViolationsByOrg(ctx context.Context, orgID uuid.UUID) ([]*model.ComplianceViolation, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, rule_id, device_id, detected_at, resolved_at, status, detail, created_at
		FROM compliance_violations WHERE org_id = $1 AND status = 'active' ORDER BY detected_at DESC`,
		orgID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var violations []*model.ComplianceViolation
	for rows.Next() {
		v := &model.ComplianceViolation{}
		if err := rows.Scan(
			&v.ID, &v.OrgID, &v.RuleID, &v.DeviceID, &v.DetectedAt,
			&v.ResolvedAt, &v.Status, &v.Detail, &v.CreatedAt,
		); err != nil {
			return nil, err
		}
		violations = append(violations, v)
	}
	return violations, nil
}
