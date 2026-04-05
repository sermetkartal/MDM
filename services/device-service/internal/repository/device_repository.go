package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/device-service/internal/model"
)

type DeviceRepository struct {
	db *sql.DB
}

func NewDeviceRepository(db *sql.DB) *DeviceRepository {
	return &DeviceRepository{db: db}
}

func (r *DeviceRepository) Create(ctx context.Context, device *model.Device) error {
	device.ID = uuid.New()
	device.CreatedAt = time.Now()
	device.UpdatedAt = time.Now()

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO devices (id, org_id, serial_number, hardware_id, model, manufacturer,
			os_type, os_version, agent_version, enrollment_status, compliance_state,
			enrolled_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
		device.ID, device.OrgID, device.SerialNumber, device.HardwareID,
		device.Model, device.Manufacturer, device.OSType, device.OSVersion,
		device.AgentVersion, device.EnrollmentStatus, device.ComplianceState,
		device.EnrolledAt, device.CreatedAt, device.UpdatedAt,
	)
	return err
}

func (r *DeviceRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Device, error) {
	device := &model.Device{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, org_id, serial_number, hardware_id, model, manufacturer,
			os_type, os_version, agent_version, enrollment_status, compliance_state,
			last_seen_at, enrolled_at, created_at, updated_at
		FROM devices WHERE id = $1`, id,
	).Scan(
		&device.ID, &device.OrgID, &device.SerialNumber, &device.HardwareID,
		&device.Model, &device.Manufacturer, &device.OSType, &device.OSVersion,
		&device.AgentVersion, &device.EnrollmentStatus, &device.ComplianceState,
		&device.LastSeenAt, &device.EnrolledAt, &device.CreatedAt, &device.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return device, nil
}

func (r *DeviceRepository) GetBySerialNumber(ctx context.Context, orgID uuid.UUID, serial string) (*model.Device, error) {
	device := &model.Device{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, org_id, serial_number, hardware_id, model, manufacturer,
			os_type, os_version, agent_version, enrollment_status, compliance_state,
			last_seen_at, enrolled_at, created_at, updated_at
		FROM devices WHERE org_id = $1 AND serial_number = $2`, orgID, serial,
	).Scan(
		&device.ID, &device.OrgID, &device.SerialNumber, &device.HardwareID,
		&device.Model, &device.Manufacturer, &device.OSType, &device.OSVersion,
		&device.AgentVersion, &device.EnrollmentStatus, &device.ComplianceState,
		&device.LastSeenAt, &device.EnrolledAt, &device.CreatedAt, &device.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return device, nil
}

func (r *DeviceRepository) UpdateLastSeen(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE devices SET last_seen_at = NOW(), updated_at = NOW() WHERE id = $1`, id)
	return err
}

func (r *DeviceRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status model.EnrollmentStatus) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE devices SET enrollment_status = $2, updated_at = NOW() WHERE id = $1`, id, status)
	return err
}

func (r *DeviceRepository) UpdateComplianceState(ctx context.Context, id uuid.UUID, state model.ComplianceState) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE devices SET compliance_state = $2, updated_at = NOW() WHERE id = $1`, id, state)
	return err
}

func (r *DeviceRepository) ListByOrg(ctx context.Context, orgID uuid.UUID, limit, offset int) ([]*model.Device, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, serial_number, hardware_id, model, manufacturer,
			os_type, os_version, agent_version, enrollment_status, compliance_state,
			last_seen_at, enrolled_at, created_at, updated_at
		FROM devices WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		orgID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []*model.Device
	for rows.Next() {
		d := &model.Device{}
		if err := rows.Scan(
			&d.ID, &d.OrgID, &d.SerialNumber, &d.HardwareID,
			&d.Model, &d.Manufacturer, &d.OSType, &d.OSVersion,
			&d.AgentVersion, &d.EnrollmentStatus, &d.ComplianceState,
			&d.LastSeenAt, &d.EnrolledAt, &d.CreatedAt, &d.UpdatedAt,
		); err != nil {
			return nil, err
		}
		devices = append(devices, d)
	}
	return devices, nil
}
