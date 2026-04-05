package model

import (
	"time"

	"github.com/google/uuid"
)

type SupervisionStatus string

const (
	SupervisionStatusUnsupervised SupervisionStatus = "unsupervised"
	SupervisionStatusSupervised   SupervisionStatus = "supervised"
)

type EnrollmentType string

const (
	EnrollmentTypeManual EnrollmentType = "manual"
	EnrollmentTypeDEP    EnrollmentType = "dep"
)

type IOSDevice struct {
	ID                uuid.UUID         `db:"id" json:"id"`
	OrgID             uuid.UUID         `db:"org_id" json:"org_id"`
	UDID              string            `db:"udid" json:"udid"`
	SerialNumber      string            `db:"serial_number" json:"serial_number"`
	DeviceName        string            `db:"device_name" json:"device_name"`
	Model             string            `db:"model" json:"model"`
	ModelName         string            `db:"model_name" json:"model_name"`
	ProductName       string            `db:"product_name" json:"product_name"`
	OSVersion         string            `db:"os_version" json:"os_version"`
	BuildVersion      string            `db:"build_version" json:"build_version"`
	IMEI              string            `db:"imei" json:"imei"`
	MEID              string            `db:"meid" json:"meid"`
	PushToken         string            `db:"push_token" json:"push_token"`
	PushMagic         string            `db:"push_magic" json:"push_magic"`
	UnlockToken       []byte            `db:"unlock_token" json:"-"`
	Topic             string            `db:"topic" json:"topic"`
	SupervisionStatus SupervisionStatus `db:"supervision_status" json:"supervision_status"`
	EnrollmentType    EnrollmentType    `db:"enrollment_type" json:"enrollment_type"`
	DEPProfileUUID    string            `db:"dep_profile_uuid" json:"dep_profile_uuid,omitempty"`
	IsActivationLocked bool            `db:"is_activation_locked" json:"is_activation_locked"`
	LastSeenAt        *time.Time        `db:"last_seen_at" json:"last_seen_at"`
	EnrolledAt        *time.Time        `db:"enrolled_at" json:"enrolled_at"`
	CreatedAt         time.Time         `db:"created_at" json:"created_at"`
	UpdatedAt         time.Time         `db:"updated_at" json:"updated_at"`
}

type MDMProfile struct {
	ID                uuid.UUID `db:"id" json:"id"`
	OrgID             uuid.UUID `db:"org_id" json:"org_id"`
	PayloadIdentifier string    `db:"payload_identifier" json:"payload_identifier"`
	PayloadUUID       string    `db:"payload_uuid" json:"payload_uuid"`
	PayloadType       string    `db:"payload_type" json:"payload_type"`
	Name              string    `db:"name" json:"name"`
	Description       string    `db:"description" json:"description"`
	ProfileData       []byte    `db:"profile_data" json:"-"`
	Version           int       `db:"version" json:"version"`
	CreatedAt         time.Time `db:"created_at" json:"created_at"`
	UpdatedAt         time.Time `db:"updated_at" json:"updated_at"`
}

type ConfigProfile struct {
	ID                uuid.UUID `db:"id" json:"id"`
	OrgID             uuid.UUID `db:"org_id" json:"org_id"`
	PayloadIdentifier string    `db:"payload_identifier" json:"payload_identifier"`
	PayloadUUID       string    `db:"payload_uuid" json:"payload_uuid"`
	PayloadType       string    `db:"payload_type" json:"payload_type"`
	Name              string    `db:"name" json:"name"`
	Description       string    `db:"description" json:"description"`
	ProfileData       []byte    `db:"profile_data" json:"-"`
	Signed            bool      `db:"signed" json:"signed"`
	CreatedAt         time.Time `db:"created_at" json:"created_at"`
}
