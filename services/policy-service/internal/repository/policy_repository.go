package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/policy-service/internal/model"
)

type PolicyRepository struct {
	db *sql.DB
}

func NewPolicyRepository(db *sql.DB) *PolicyRepository {
	return &PolicyRepository{db: db}
}

// Create inserts a new policy and its initial version (version=1) in a transaction.
func (r *PolicyRepository) Create(ctx context.Context, policy *model.Policy, initialPayload map[string]interface{}) error {
	policy.ID = uuid.New()
	policy.CreatedAt = time.Now()
	policy.UpdatedAt = time.Now()

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO policies (id, org_id, name, description, policy_type,
			conflict_resolution, priority, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		policy.ID, policy.OrgID, policy.Name, policy.Description,
		policy.PolicyType, policy.ConflictResolution, policy.Priority,
		policy.IsActive, policy.CreatedAt, policy.UpdatedAt,
	)
	if err != nil {
		return err
	}

	if initialPayload != nil {
		payloadJSON, err := json.Marshal(initialPayload)
		if err != nil {
			return err
		}
		versionID := uuid.New()
		_, err = tx.ExecContext(ctx, `
			INSERT INTO policy_versions (id, policy_id, version, payload, created_by, created_at)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			versionID, policy.ID, 1, payloadJSON, uuid.Nil, time.Now(),
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *PolicyRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Policy, error) {
	policy := &model.Policy{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, org_id, name, description, policy_type, conflict_resolution,
			priority, is_active, created_at, updated_at
		FROM policies WHERE id = $1`, id,
	).Scan(
		&policy.ID, &policy.OrgID, &policy.Name, &policy.Description,
		&policy.PolicyType, &policy.ConflictResolution, &policy.Priority,
		&policy.IsActive, &policy.CreatedAt, &policy.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return policy, nil
}

// Update updates a policy's metadata and creates a new version with the provided payload.
func (r *PolicyRepository) Update(ctx context.Context, policy *model.Policy, newPayload map[string]interface{}, updatedBy uuid.UUID) error {
	policy.UpdatedAt = time.Now()

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		UPDATE policies SET name = $2, description = $3, policy_type = $4,
			conflict_resolution = $5, priority = $6, is_active = $7, updated_at = $8
		WHERE id = $1`,
		policy.ID, policy.Name, policy.Description, policy.PolicyType,
		policy.ConflictResolution, policy.Priority, policy.IsActive, policy.UpdatedAt,
	)
	if err != nil {
		return err
	}

	if newPayload != nil {
		// Get current latest version number
		var currentVersion int
		err = tx.QueryRowContext(ctx, `
			SELECT COALESCE(MAX(version), 0) FROM policy_versions WHERE policy_id = $1`,
			policy.ID,
		).Scan(&currentVersion)
		if err != nil {
			return err
		}

		payloadJSON, err := json.Marshal(newPayload)
		if err != nil {
			return err
		}
		versionID := uuid.New()
		_, err = tx.ExecContext(ctx, `
			INSERT INTO policy_versions (id, policy_id, version, payload, created_by, created_at)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			versionID, policy.ID, currentVersion+1, payloadJSON, updatedBy, time.Now(),
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *PolicyRepository) ListByOrg(ctx context.Context, orgID uuid.UUID, limit, offset int) ([]*model.Policy, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, name, description, policy_type, conflict_resolution,
			priority, is_active, created_at, updated_at
		FROM policies WHERE org_id = $1 ORDER BY priority DESC, created_at DESC
		LIMIT $2 OFFSET $3`, orgID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var policies []*model.Policy
	for rows.Next() {
		p := &model.Policy{}
		if err := rows.Scan(
			&p.ID, &p.OrgID, &p.Name, &p.Description,
			&p.PolicyType, &p.ConflictResolution, &p.Priority,
			&p.IsActive, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		policies = append(policies, p)
	}
	return policies, nil
}

func (r *PolicyRepository) CreateVersion(ctx context.Context, version *model.PolicyVersion) error {
	version.ID = uuid.New()
	version.CreatedAt = time.Now()

	payloadJSON, err := json.Marshal(version.Payload)
	if err != nil {
		return err
	}

	_, err = r.db.ExecContext(ctx, `
		INSERT INTO policy_versions (id, policy_id, version, payload, created_by, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		version.ID, version.PolicyID, version.Version, payloadJSON,
		version.CreatedBy, version.CreatedAt,
	)
	return err
}

func (r *PolicyRepository) GetLatestVersion(ctx context.Context, policyID uuid.UUID) (*model.PolicyVersion, error) {
	v := &model.PolicyVersion{}
	var payloadJSON []byte
	err := r.db.QueryRowContext(ctx, `
		SELECT id, policy_id, version, payload, created_by, created_at
		FROM policy_versions WHERE policy_id = $1
		ORDER BY version DESC LIMIT 1`, policyID,
	).Scan(&v.ID, &v.PolicyID, &v.Version, &payloadJSON, &v.CreatedBy, &v.CreatedAt)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(payloadJSON, &v.Payload); err != nil {
		return nil, err
	}
	return v, nil
}

// GetPolicyVersions returns the full version history for a policy, ordered newest first.
func (r *PolicyRepository) GetPolicyVersions(ctx context.Context, policyID uuid.UUID) ([]model.PolicyVersion, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, policy_id, version, payload, created_by, created_at
		FROM policy_versions WHERE policy_id = $1
		ORDER BY version DESC`, policyID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var versions []model.PolicyVersion
	for rows.Next() {
		v := model.PolicyVersion{}
		var payloadJSON []byte
		if err := rows.Scan(&v.ID, &v.PolicyID, &v.Version, &payloadJSON, &v.CreatedBy, &v.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(payloadJSON, &v.Payload); err != nil {
			return nil, err
		}
		versions = append(versions, v)
	}
	return versions, nil
}

func (r *PolicyRepository) CreateAssignment(ctx context.Context, assignment *model.PolicyAssignment) error {
	assignment.ID = uuid.New()
	assignment.AssignedAt = time.Now()

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO policy_assignments (id, policy_id, target_type, target_id, assigned_by, assigned_at)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		assignment.ID, assignment.PolicyID, assignment.TargetType,
		assignment.TargetID, assignment.AssignedBy, assignment.AssignedAt,
	)
	return err
}

func (r *PolicyRepository) GetAssignmentsByTarget(ctx context.Context, targetType model.AssignmentTarget, targetID uuid.UUID) ([]model.PolicyAssignment, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, policy_id, target_type, target_id, assigned_by, assigned_at
		FROM policy_assignments WHERE target_type = $1 AND target_id = $2`,
		targetType, targetID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var assignments []model.PolicyAssignment
	for rows.Next() {
		a := model.PolicyAssignment{}
		if err := rows.Scan(
			&a.ID, &a.PolicyID, &a.TargetType, &a.TargetID,
			&a.AssignedBy, &a.AssignedAt,
		); err != nil {
			return nil, err
		}
		assignments = append(assignments, a)
	}
	return assignments, nil
}

// GetAssignmentByID retrieves a single assignment by its ID.
func (r *PolicyRepository) GetAssignmentByID(ctx context.Context, id uuid.UUID) (*model.PolicyAssignment, error) {
	a := &model.PolicyAssignment{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, policy_id, target_type, target_id, assigned_by, assigned_at
		FROM policy_assignments WHERE id = $1`, id,
	).Scan(&a.ID, &a.PolicyID, &a.TargetType, &a.TargetID, &a.AssignedBy, &a.AssignedAt)
	if err != nil {
		return nil, err
	}
	return a, nil
}

func (r *PolicyRepository) DeleteAssignment(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM policy_assignments WHERE id = $1`, id)
	return err
}

// GetDeviceIDsByGroup returns all device IDs belonging to a group.
func (r *PolicyRepository) GetDeviceIDsByGroup(ctx context.Context, groupID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT device_id FROM device_groups WHERE group_id = $1`, groupID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// GetDeviceIDsByOrg returns all device IDs in an org.
func (r *PolicyRepository) GetDeviceIDsByOrg(ctx context.Context, orgID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id FROM devices WHERE org_id = $1`, orgID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}
