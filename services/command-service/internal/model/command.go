package model

import (
	"time"

	"github.com/google/uuid"
)

type CommandType string

const (
	CommandTypeLock          CommandType = "lock"
	CommandTypeWipe          CommandType = "wipe"
	CommandTypeResetPassword CommandType = "reset_password"
	CommandTypeInstallApp    CommandType = "install_app"
	CommandTypeUninstallApp  CommandType = "uninstall_app"
	CommandTypeUpdateOS      CommandType = "update_os"
	CommandTypeReboot        CommandType = "reboot"
	CommandTypeSendMessage   CommandType = "send_message"
	CommandTypeSetPolicy     CommandType = "set_policy"
	CommandTypeCollectLogs   CommandType = "collect_logs"
	CommandTypeLocate        CommandType = "locate"
	CommandTypeRingDevice    CommandType = "ring_device"
)

type CommandStatus string

const (
	CommandStatusPending    CommandStatus = "pending"
	CommandStatusQueued     CommandStatus = "queued"
	CommandStatusDelivered  CommandStatus = "delivered"
	CommandStatusExecuting  CommandStatus = "executing"
	CommandStatusCompleted  CommandStatus = "completed"
	CommandStatusFailed     CommandStatus = "failed"
	CommandStatusCancelled  CommandStatus = "cancelled"
	CommandStatusExpired    CommandStatus = "expired"
)

type Command struct {
	ID          uuid.UUID              `db:"id" json:"id"`
	OrgID       uuid.UUID              `db:"org_id" json:"org_id"`
	DeviceID    uuid.UUID              `db:"device_id" json:"device_id"`
	CommandType CommandType            `db:"command_type" json:"command_type"`
	Status      CommandStatus          `db:"status" json:"status"`
	Payload     map[string]interface{} `db:"payload" json:"payload"`
	IssuedBy    uuid.UUID              `db:"issued_by" json:"issued_by"`
	ExpiresAt   *time.Time             `db:"expires_at" json:"expires_at"`
	CreatedAt   time.Time              `db:"created_at" json:"created_at"`
	UpdatedAt   time.Time              `db:"updated_at" json:"updated_at"`
}

type CommandHistory struct {
	ID        uuid.UUID     `db:"id" json:"id"`
	CommandID uuid.UUID     `db:"command_id" json:"command_id"`
	Status    CommandStatus `db:"status" json:"status"`
	Message   string        `db:"message" json:"message"`
	CreatedAt time.Time     `db:"created_at" json:"created_at"`
}
