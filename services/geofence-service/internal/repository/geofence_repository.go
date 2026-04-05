package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/geofence-service/internal/model"
)

type GeofenceRepository struct {
	db *sql.DB
}

func NewGeofenceRepository(db *sql.DB) *GeofenceRepository {
	return &GeofenceRepository{db: db}
}

func (r *GeofenceRepository) Create(ctx context.Context, g *model.Geofence) error {
	g.ID = uuid.New()
	g.CreatedAt = time.Now()
	g.UpdatedAt = time.Now()
	if !g.IsActive {
		g.IsActive = true
	}

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO geofences (id, org_id, name, type, center_lat, center_lng, radius_meters, polygon, dwell_time_seconds, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		g.ID, g.OrgID, g.Name, g.Type, g.CenterLat, g.CenterLng, g.RadiusMeters, g.Polygon, g.DwellTimeSeconds, g.IsActive, g.CreatedAt, g.UpdatedAt,
	)
	return err
}

func (r *GeofenceRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Geofence, error) {
	g := &model.Geofence{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, org_id, name, type, center_lat, center_lng, radius_meters, polygon, dwell_time_seconds, is_active, created_at, updated_at
		FROM geofences WHERE id = $1`, id,
	).Scan(&g.ID, &g.OrgID, &g.Name, &g.Type, &g.CenterLat, &g.CenterLng, &g.RadiusMeters, &g.Polygon, &g.DwellTimeSeconds, &g.IsActive, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return g, nil
}

func (r *GeofenceRepository) Update(ctx context.Context, g *model.Geofence) error {
	g.UpdatedAt = time.Now()
	_, err := r.db.ExecContext(ctx, `
		UPDATE geofences SET name = $2, type = $3, center_lat = $4, center_lng = $5,
			radius_meters = $6, polygon = $7, dwell_time_seconds = $8, is_active = $9, updated_at = $10
		WHERE id = $1`,
		g.ID, g.Name, g.Type, g.CenterLat, g.CenterLng, g.RadiusMeters, g.Polygon, g.DwellTimeSeconds, g.IsActive, g.UpdatedAt,
	)
	return err
}

func (r *GeofenceRepository) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*model.Geofence, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, name, type, center_lat, center_lng, radius_meters, polygon, dwell_time_seconds, is_active, created_at, updated_at
		FROM geofences WHERE org_id = $1 ORDER BY created_at DESC`, orgID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var geofences []*model.Geofence
	for rows.Next() {
		g := &model.Geofence{}
		if err := rows.Scan(&g.ID, &g.OrgID, &g.Name, &g.Type, &g.CenterLat, &g.CenterLng, &g.RadiusMeters, &g.Polygon, &g.DwellTimeSeconds, &g.IsActive, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, err
		}
		geofences = append(geofences, g)
	}
	return geofences, nil
}

func (r *GeofenceRepository) ListActiveByOrg(ctx context.Context, orgID uuid.UUID) ([]*model.Geofence, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, name, type, center_lat, center_lng, radius_meters, polygon, dwell_time_seconds, is_active, created_at, updated_at
		FROM geofences WHERE org_id = $1 AND is_active = true ORDER BY created_at DESC`, orgID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var geofences []*model.Geofence
	for rows.Next() {
		g := &model.Geofence{}
		if err := rows.Scan(&g.ID, &g.OrgID, &g.Name, &g.Type, &g.CenterLat, &g.CenterLng, &g.RadiusMeters, &g.Polygon, &g.DwellTimeSeconds, &g.IsActive, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, err
		}
		geofences = append(geofences, g)
	}
	return geofences, nil
}

func (r *GeofenceRepository) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM geofences WHERE id = $1`, id)
	return err
}

func (r *GeofenceRepository) CreatePolicy(ctx context.Context, p *model.GeofencePolicy) error {
	p.ID = uuid.New()
	p.CreatedAt = time.Now()

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO geofence_policies (id, geofence_id, trigger_type, action_type, action_config, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		p.ID, p.GeofenceID, p.TriggerType, p.ActionType, p.ActionConfig, p.CreatedAt,
	)
	return err
}

func (r *GeofenceRepository) GetPoliciesByGeofence(ctx context.Context, geofenceID uuid.UUID) ([]*model.GeofencePolicy, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, geofence_id, trigger_type, action_type, action_config, created_at
		FROM geofence_policies WHERE geofence_id = $1`, geofenceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var policies []*model.GeofencePolicy
	for rows.Next() {
		p := &model.GeofencePolicy{}
		if err := rows.Scan(&p.ID, &p.GeofenceID, &p.TriggerType, &p.ActionType, &p.ActionConfig, &p.CreatedAt); err != nil {
			return nil, err
		}
		policies = append(policies, p)
	}
	return policies, nil
}

func (r *GeofenceRepository) DeletePolicy(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM geofence_policies WHERE id = $1`, id)
	return err
}

func (r *GeofenceRepository) SaveEvent(ctx context.Context, e *model.GeofenceEvent) error {
	e.ID = uuid.New()
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO geofence_events (id, device_id, geofence_id, org_id, trigger_type, latitude, longitude, occurred_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		e.ID, e.DeviceID, e.GeofenceID, e.OrgID, e.TriggerType, e.Latitude, e.Longitude, e.OccurredAt,
	)
	return err
}

func (r *GeofenceRepository) ListEventsByGeofence(ctx context.Context, geofenceID uuid.UUID, limit int) ([]*model.GeofenceEvent, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, device_id, geofence_id, org_id, trigger_type, latitude, longitude, occurred_at
		FROM geofence_events WHERE geofence_id = $1 ORDER BY occurred_at DESC LIMIT $2`, geofenceID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*model.GeofenceEvent
	for rows.Next() {
		e := &model.GeofenceEvent{}
		if err := rows.Scan(&e.ID, &e.DeviceID, &e.GeofenceID, &e.OrgID, &e.TriggerType, &e.Latitude, &e.Longitude, &e.OccurredAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}
