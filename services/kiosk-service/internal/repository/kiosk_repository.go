package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/kiosk-service/internal/model"
)

type KioskRepository struct {
	db *sql.DB
}

func NewKioskRepository(db *sql.DB) *KioskRepository {
	return &KioskRepository{db: db}
}

func (r *KioskRepository) CreateProfile(ctx context.Context, p *model.KioskProfile) error {
	p.ID = uuid.New()
	p.CreatedAt = time.Now()
	p.UpdatedAt = time.Now()

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO kiosk_profiles (id, org_id, name, mode, config, wallpaper_url, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		p.ID, p.OrgID, p.Name, p.Mode, p.Config, p.WallpaperURL, p.IsActive, p.CreatedAt, p.UpdatedAt,
	)
	return err
}

func (r *KioskRepository) GetProfileByID(ctx context.Context, id uuid.UUID) (*model.KioskProfile, error) {
	p := &model.KioskProfile{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, org_id, name, mode, config, wallpaper_url, is_active, created_at, updated_at
		FROM kiosk_profiles WHERE id = $1`, id,
	).Scan(&p.ID, &p.OrgID, &p.Name, &p.Mode, &p.Config, &p.WallpaperURL, &p.IsActive, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *KioskRepository) UpdateProfile(ctx context.Context, p *model.KioskProfile) error {
	p.UpdatedAt = time.Now()
	_, err := r.db.ExecContext(ctx, `
		UPDATE kiosk_profiles SET name = $2, mode = $3, config = $4, wallpaper_url = $5,
			is_active = $6, updated_at = $7
		WHERE id = $1`,
		p.ID, p.Name, p.Mode, p.Config, p.WallpaperURL, p.IsActive, p.UpdatedAt,
	)
	return err
}

func (r *KioskRepository) ListProfilesByOrg(ctx context.Context, orgID uuid.UUID) ([]*model.KioskProfile, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, name, mode, config, wallpaper_url, is_active, created_at, updated_at
		FROM kiosk_profiles WHERE org_id = $1 ORDER BY created_at DESC`, orgID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var profiles []*model.KioskProfile
	for rows.Next() {
		p := &model.KioskProfile{}
		if err := rows.Scan(&p.ID, &p.OrgID, &p.Name, &p.Mode, &p.Config, &p.WallpaperURL, &p.IsActive, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		profiles = append(profiles, p)
	}
	return profiles, nil
}

func (r *KioskRepository) CreateAssignment(ctx context.Context, a *model.KioskAssignment) error {
	a.ID = uuid.New()
	a.CreatedAt = time.Now()

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO kiosk_profile_assignments (id, kiosk_profile_id, target_type, target_id, created_at)
		VALUES ($1, $2, $3, $4, $5)`,
		a.ID, a.KioskProfileID, a.TargetType, a.TargetID, a.CreatedAt,
	)
	return err
}

func (r *KioskRepository) GetAssignmentsByTarget(ctx context.Context, targetType string, targetID uuid.UUID) ([]*model.KioskAssignment, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, kiosk_profile_id, target_type, target_id, created_at
		FROM kiosk_profile_assignments WHERE target_type = $1 AND target_id = $2`,
		targetType, targetID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var assignments []*model.KioskAssignment
	for rows.Next() {
		a := &model.KioskAssignment{}
		if err := rows.Scan(&a.ID, &a.KioskProfileID, &a.TargetType, &a.TargetID, &a.CreatedAt); err != nil {
			return nil, err
		}
		assignments = append(assignments, a)
	}
	return assignments, nil
}

func (r *KioskRepository) DeleteAssignment(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM kiosk_profile_assignments WHERE id = $1`, id)
	return err
}
