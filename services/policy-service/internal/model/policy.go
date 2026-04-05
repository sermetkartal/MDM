package model

import (
	"time"

	"github.com/google/uuid"
)

type PolicyType string

const (
	PolicyTypePasscode      PolicyType = "passcode"
	PolicyTypeRestrictions  PolicyType = "restrictions"
	PolicyTypeWifi          PolicyType = "wifi"
	PolicyTypeVPN           PolicyType = "vpn"
	PolicyTypeCompliance    PolicyType = "compliance"
	PolicyTypeAppManagement PolicyType = "app_management"
	PolicyTypeUpdate        PolicyType = "update"
)

type ConflictResolution string

const (
	ConflictResolutionMostRestrictive ConflictResolution = "most_restrictive"
	ConflictResolutionLeastRestrictive ConflictResolution = "least_restrictive"
	ConflictResolutionDeviceWins      ConflictResolution = "device_wins"
	ConflictResolutionOrgWins         ConflictResolution = "org_wins"
)

type AssignmentTarget string

const (
	AssignmentTargetOrg    AssignmentTarget = "org"
	AssignmentTargetGroup  AssignmentTarget = "group"
	AssignmentTargetDevice AssignmentTarget = "device"
)

type Policy struct {
	ID                 uuid.UUID          `db:"id" json:"id"`
	OrgID              uuid.UUID          `db:"org_id" json:"org_id"`
	Name               string             `db:"name" json:"name"`
	Description        string             `db:"description" json:"description"`
	PolicyType         PolicyType         `db:"policy_type" json:"policy_type"`
	ConflictResolution ConflictResolution `db:"conflict_resolution" json:"conflict_resolution"`
	Priority           int                `db:"priority" json:"priority"`
	IsActive           bool               `db:"is_active" json:"is_active"`
	CreatedAt          time.Time          `db:"created_at" json:"created_at"`
	UpdatedAt          time.Time          `db:"updated_at" json:"updated_at"`
}

type PolicyVersion struct {
	ID        uuid.UUID              `db:"id" json:"id"`
	PolicyID  uuid.UUID              `db:"policy_id" json:"policy_id"`
	Version   int                    `db:"version" json:"version"`
	Payload   map[string]interface{} `db:"payload" json:"payload"`
	CreatedBy uuid.UUID              `db:"created_by" json:"created_by"`
	CreatedAt time.Time              `db:"created_at" json:"created_at"`
}

type PolicyAssignment struct {
	ID         uuid.UUID        `db:"id" json:"id"`
	PolicyID   uuid.UUID        `db:"policy_id" json:"policy_id"`
	TargetType AssignmentTarget `db:"target_type" json:"target_type"`
	TargetID   uuid.UUID        `db:"target_id" json:"target_id"`
	AssignedBy uuid.UUID        `db:"assigned_by" json:"assigned_by"`
	AssignedAt time.Time        `db:"assigned_at" json:"assigned_at"`
}
