package model

import (
	"time"

	"github.com/google/uuid"
)

type Certificate struct {
	ID           uuid.UUID  `db:"id" json:"id"`
	OrgID        uuid.UUID  `db:"org_id" json:"org_id"`
	DeviceID     string     `db:"device_id" json:"device_id,omitempty"`
	Name         string     `db:"name" json:"name"`
	Type         string     `db:"type" json:"type"`
	Thumbprint   string     `db:"thumbprint" json:"thumbprint"`
	SerialNumber string     `db:"serial_number" json:"serial_number"`
	Issuer       string     `db:"issuer" json:"issuer"`
	Subject      string     `db:"subject" json:"subject"`
	NotBefore    *time.Time `db:"not_before" json:"not_before,omitempty"`
	NotAfter     *time.Time `db:"not_after" json:"not_after,omitempty"`
	Status       string     `db:"status" json:"status"`
	FileURL      string     `db:"file_url" json:"file_url,omitempty"`
	CreatedAt    time.Time  `db:"created_at" json:"created_at"`
}

type CertRequest struct {
	OrgID        uuid.UUID `json:"org_id"`
	CommonName   string    `json:"common_name"`
	Organization string    `json:"organization"`
	CSR          []byte    `json:"csr"`
	ValidityDays int       `json:"validity_days"`
}

type CRL struct {
	OrgID               uuid.UUID     `json:"org_id"`
	RevokedCertificates []RevokedCert `json:"revoked_certificates"`
	GeneratedAt         time.Time     `json:"generated_at"`
}

type RevokedCert struct {
	SerialNumber string    `json:"serial_number"`
	RevokedAt    time.Time `json:"revoked_at"`
}
