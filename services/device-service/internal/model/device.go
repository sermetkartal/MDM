package model

import (
	"time"

	"github.com/google/uuid"
)

type EnrollmentStatus string

const (
	EnrollmentStatusPending    EnrollmentStatus = "pending"
	EnrollmentStatusEnrolled   EnrollmentStatus = "enrolled"
	EnrollmentStatusUnenrolling EnrollmentStatus = "unenrolling"
	EnrollmentStatusUnenrolled EnrollmentStatus = "unenrolled"
)

type ComplianceState string

const (
	ComplianceStateCompliant    ComplianceState = "compliant"
	ComplianceStateNonCompliant ComplianceState = "non_compliant"
	ComplianceStatePending      ComplianceState = "pending"
	ComplianceStateUnknown      ComplianceState = "unknown"
)

type Device struct {
	ID               uuid.UUID        `db:"id" json:"id"`
	OrgID            uuid.UUID        `db:"org_id" json:"org_id"`
	SerialNumber     string           `db:"serial_number" json:"serial_number"`
	HardwareID       string           `db:"hardware_id" json:"hardware_id"`
	Model            string           `db:"model" json:"model"`
	Manufacturer     string           `db:"manufacturer" json:"manufacturer"`
	OSType           string           `db:"os_type" json:"os_type"`
	OSVersion        string           `db:"os_version" json:"os_version"`
	AgentVersion     string           `db:"agent_version" json:"agent_version"`
	EnrollmentStatus EnrollmentStatus `db:"enrollment_status" json:"enrollment_status"`
	ComplianceState  ComplianceState  `db:"compliance_state" json:"compliance_state"`
	LastSeenAt       *time.Time       `db:"last_seen_at" json:"last_seen_at"`
	EnrolledAt       *time.Time       `db:"enrolled_at" json:"enrolled_at"`
	CreatedAt        time.Time        `db:"created_at" json:"created_at"`
	UpdatedAt        time.Time        `db:"updated_at" json:"updated_at"`
}

type EnrollRequest struct {
	SerialNumber      string
	HardwareID        string
	Model             string
	Manufacturer      string
	OSVersion         string
	AgentVersion      string
	PlayIntegrityToken []byte
	CSR               []byte
	EnrollmentMethod  string
}

type HeartbeatData struct {
	DeviceID        uuid.UUID
	BatteryLevel    int32
	StorageFreeBytes int64
	MemoryFreeBytes int64
	OSVersion       string
	AgentVersion    string
	InstalledApps   []InstalledApp
	SecurityState   SecurityState
}

type InstalledApp struct {
	PackageName string `json:"package_name"`
	VersionCode int32  `json:"version_code"`
	VersionName string `json:"version_name"`
	AppName     string `json:"app_name"`
	IsSystemApp bool   `json:"is_system_app"`
}

type SecurityState struct {
	IsEncrypted           bool `json:"is_encrypted"`
	IsRooted              bool `json:"is_rooted"`
	DeveloperOptionsEnabled bool `json:"developer_options_enabled"`
	USBDebuggingEnabled   bool `json:"usb_debugging_enabled"`
	ScreenLockEnabled     bool `json:"screen_lock_enabled"`
	PlayIntegrityVerdict  string `json:"play_integrity_verdict"`
}
