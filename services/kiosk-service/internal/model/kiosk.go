package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type KioskMode string

const (
	KioskModeSingleApp      KioskMode = "single_app"
	KioskModeMultiApp       KioskMode = "multi_app"
	KioskModeDigitalSignage KioskMode = "digital_signage"
	KioskModeWebKiosk       KioskMode = "web_kiosk"
)

type KioskProfile struct {
	ID           uuid.UUID       `db:"id" json:"id"`
	OrgID        uuid.UUID       `db:"org_id" json:"org_id"`
	Name         string          `db:"name" json:"name"`
	Mode         KioskMode       `db:"mode" json:"mode"`
	Config       json.RawMessage `db:"config" json:"config"`
	WallpaperURL string          `db:"wallpaper_url" json:"wallpaper_url,omitempty"`
	IsActive     bool            `db:"is_active" json:"is_active"`
	CreatedAt    time.Time       `db:"created_at" json:"created_at"`
	UpdatedAt    time.Time       `db:"updated_at" json:"updated_at"`
}

type KioskConfig struct {
	AllowedApps      []string `json:"allowed_apps,omitempty"`
	HomeApp          string   `json:"home_app,omitempty"`
	URL              string   `json:"url,omitempty"`
	LockTaskMode     bool     `json:"lock_task_mode"`
	DisableStatusBar bool     `json:"disable_status_bar"`
	DisableNavBar    bool     `json:"disable_nav_bar"`
	AutoLaunch       bool     `json:"auto_launch"`
	IdleTimeoutSecs  int      `json:"idle_timeout_secs,omitempty"`
}

type KioskAssignment struct {
	ID             uuid.UUID `db:"id" json:"id"`
	KioskProfileID uuid.UUID `db:"kiosk_profile_id" json:"kiosk_profile_id"`
	TargetType     string    `db:"target_type" json:"target_type"`
	TargetID       uuid.UUID `db:"target_id" json:"target_id"`
	CreatedAt      time.Time `db:"created_at" json:"created_at"`
}
