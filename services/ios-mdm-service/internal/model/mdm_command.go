package model

import (
	"time"

	"github.com/google/uuid"
)

type CommandStatus string

const (
	CommandStatusPending      CommandStatus = "pending"
	CommandStatusSent         CommandStatus = "sent"
	CommandStatusAcknowledged CommandStatus = "acknowledged"
	CommandStatusError        CommandStatus = "error"
	CommandStatusNotNow       CommandStatus = "not_now"
)

type MDMCommand struct {
	CommandUUID uuid.UUID     `db:"command_uuid" json:"command_uuid"`
	DeviceUDID  string        `db:"device_udid" json:"device_udid"`
	RequestType string        `db:"request_type" json:"request_type"`
	Command     []byte        `db:"command" json:"-"`
	Status      CommandStatus `db:"status" json:"status"`
	CreatedAt   time.Time     `db:"created_at" json:"created_at"`
	UpdatedAt   time.Time     `db:"updated_at" json:"updated_at"`
}

type CommandResponse struct {
	CommandUUID uuid.UUID              `json:"command_uuid"`
	Status      string                 `json:"status"`
	UDID        string                 `json:"udid"`
	Response    map[string]interface{} `json:"response,omitempty"`
	ErrorChain  []CommandError         `json:"error_chain,omitempty"`
}

type CommandError struct {
	ErrorCode            int    `json:"error_code"`
	ErrorDomain          string `json:"error_domain"`
	LocalizedDescription string `json:"localized_description"`
	USEnglishDescription string `json:"us_english_description"`
}
