package model

import (
	"time"

	"github.com/google/uuid"
)

type SessionState string

const (
	SessionStateCreated    SessionState = "created"
	SessionStateConnecting SessionState = "connecting"
	SessionStateActive     SessionState = "active"
	SessionStateEnded      SessionState = "ended"
)

type MessageType string

const (
	MessageTypeOffer        MessageType = "offer"
	MessageTypeAnswer       MessageType = "answer"
	MessageTypeCandidate    MessageType = "candidate"
	MessageTypeBye          MessageType = "bye"
	MessageTypeQualityChange MessageType = "quality_change"
)

type QualityPreset string

const (
	QualityLow    QualityPreset = "low"
	QualityMedium QualityPreset = "medium"
	QualityHigh   QualityPreset = "high"
)

type Session struct {
	ID           uuid.UUID    `json:"id"`
	OrgID        uuid.UUID    `json:"org_id"`
	DeviceID     uuid.UUID    `json:"device_id"`
	UserID       uuid.UUID    `json:"user_id"`
	State        SessionState `json:"state"`
	Quality      QualityPreset `json:"quality"`
	CreatedAt    time.Time    `json:"created_at"`
	LastActivity time.Time    `json:"last_activity"`
	EndedAt      *time.Time   `json:"ended_at,omitempty"`
}

type SignalingMessage struct {
	SessionID uuid.UUID   `json:"session_id"`
	Type      MessageType `json:"type"`
	From      string      `json:"from"` // "admin" or "device"
	To        string      `json:"to"`   // "admin" or "device"
	Payload   string      `json:"payload"`
	Timestamp time.Time   `json:"timestamp"`
}

type SessionStatus struct {
	ID        uuid.UUID    `json:"id"`
	DeviceID  uuid.UUID    `json:"device_id"`
	State     SessionState `json:"state"`
	Quality   QualityPreset `json:"quality"`
	Duration  int64        `json:"duration_seconds"`
	CreatedAt time.Time    `json:"created_at"`
}
