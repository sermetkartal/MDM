package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/cert-service/internal/model"
)

type CertRepository struct {
	db *sql.DB
}

func NewCertRepository(db *sql.DB) *CertRepository {
	return &CertRepository{db: db}
}

func (r *CertRepository) Create(ctx context.Context, cert *model.Certificate) error {
	cert.ID = uuid.New()
	cert.CreatedAt = time.Now()
	if cert.Status == "" {
		cert.Status = "active"
	}

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO certificates (id, org_id, device_id, name, type, thumbprint, serial_number, issuer, subject, not_before, not_after, status, file_url, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
		cert.ID, cert.OrgID, cert.DeviceID, cert.Name, cert.Type, cert.Thumbprint, cert.SerialNumber,
		cert.Issuer, cert.Subject, cert.NotBefore, cert.NotAfter, cert.Status, cert.FileURL, cert.CreatedAt,
	)
	return err
}

func (r *CertRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Certificate, error) {
	cert := &model.Certificate{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, org_id, COALESCE(device_id, ''), name, type, thumbprint, serial_number, issuer, subject, not_before, not_after, COALESCE(status, 'active'), COALESCE(file_url, ''), created_at
		FROM certificates WHERE id = $1`, id,
	).Scan(
		&cert.ID, &cert.OrgID, &cert.DeviceID, &cert.Name, &cert.Type, &cert.Thumbprint, &cert.SerialNumber,
		&cert.Issuer, &cert.Subject, &cert.NotBefore, &cert.NotAfter, &cert.Status, &cert.FileURL, &cert.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return cert, nil
}

func (r *CertRepository) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*model.Certificate, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, COALESCE(device_id, ''), name, type, thumbprint, serial_number, issuer, subject, not_before, not_after, COALESCE(status, 'active'), COALESCE(file_url, ''), created_at
		FROM certificates WHERE org_id = $1 ORDER BY created_at DESC`, orgID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var certs []*model.Certificate
	for rows.Next() {
		cert := &model.Certificate{}
		if err := rows.Scan(
			&cert.ID, &cert.OrgID, &cert.DeviceID, &cert.Name, &cert.Type, &cert.Thumbprint, &cert.SerialNumber,
			&cert.Issuer, &cert.Subject, &cert.NotBefore, &cert.NotAfter, &cert.Status, &cert.FileURL, &cert.CreatedAt,
		); err != nil {
			return nil, err
		}
		certs = append(certs, cert)
	}
	return certs, nil
}

func (r *CertRepository) GetActiveByDeviceID(ctx context.Context, deviceID string) ([]*model.Certificate, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, COALESCE(device_id, ''), name, type, thumbprint, serial_number, issuer, subject, not_before, not_after, COALESCE(status, 'active'), COALESCE(file_url, ''), created_at
		FROM certificates WHERE device_id = $1 AND status = 'active' ORDER BY created_at DESC`, deviceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var certs []*model.Certificate
	for rows.Next() {
		cert := &model.Certificate{}
		if err := rows.Scan(
			&cert.ID, &cert.OrgID, &cert.DeviceID, &cert.Name, &cert.Type, &cert.Thumbprint, &cert.SerialNumber,
			&cert.Issuer, &cert.Subject, &cert.NotBefore, &cert.NotAfter, &cert.Status, &cert.FileURL, &cert.CreatedAt,
		); err != nil {
			return nil, err
		}
		certs = append(certs, cert)
	}
	return certs, nil
}

func (r *CertRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE certificates SET status = $1 WHERE id = $2`, status, id)
	return err
}

func (r *CertRepository) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM certificates WHERE id = $1`, id)
	return err
}

func (r *CertRepository) GetRevokedByOrg(ctx context.Context, orgID uuid.UUID) ([]model.RevokedCert, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT serial_number, created_at
		FROM certificates
		WHERE org_id = $1 AND status = 'revoked'
		ORDER BY created_at DESC`, orgID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var revoked []model.RevokedCert
	for rows.Next() {
		var rc model.RevokedCert
		if err := rows.Scan(&rc.SerialNumber, &rc.RevokedAt); err != nil {
			return nil, err
		}
		revoked = append(revoked, rc)
	}
	return revoked, nil
}
