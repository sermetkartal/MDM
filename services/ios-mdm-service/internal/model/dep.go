package model

import "time"

type DEPDevice struct {
	SerialNumber       string    `json:"serial_number"`
	Model              string    `json:"model"`
	Description        string    `json:"description"`
	Color              string    `json:"color"`
	AssetTag           string    `json:"asset_tag"`
	ProfileStatus      string    `json:"profile_status"`
	ProfileUUID        string    `json:"profile_uuid"`
	ProfileAssignTime  string    `json:"profile_assign_time"`
	DeviceAssignedDate string    `json:"device_assigned_date"`
	DeviceAssignedBy   string    `json:"device_assigned_by"`
	OS                 string    `json:"os"`
	DeviceFamily       string    `json:"device_family"`
	SyncedAt           time.Time `json:"synced_at"`
}

type DEPProfile struct {
	ProfileName           string   `json:"profile_name"`
	ProfileUUID           string   `json:"profile_uuid,omitempty"`
	URL                   string   `json:"url"`
	AllowPairing          bool     `json:"allow_pairing"`
	IsSupervised          bool     `json:"is_supervised"`
	IsMultiUser           bool     `json:"is_multi_user"`
	IsMandatory           bool     `json:"is_mandatory"`
	AwaitDeviceConfigured bool     `json:"await_device_configured"`
	IsRemovable           bool     `json:"is_mdm_removable"`
	SupportPhoneNumber    string   `json:"support_phone_number,omitempty"`
	SupportEmailAddress   string   `json:"support_email_address,omitempty"`
	Department            string   `json:"department,omitempty"`
	OrgMagic              string   `json:"org_magic,omitempty"`
	AnchorCerts           []string `json:"anchor_certs,omitempty"`
	SupervisingHostCerts  []string `json:"supervising_host_certs,omitempty"`
	SkipSetupItems        []string `json:"skip_setup_items,omitempty"`
}

type DEPSyncResponse struct {
	Cursor     string      `json:"cursor"`
	FetchedUntil string   `json:"fetched_until"`
	MoreToFollow bool     `json:"more_to_follow"`
	Devices    []DEPDevice `json:"devices"`
}

type DEPTokenResponse struct {
	AccessToken     string `json:"access_token"`
	AccessSecret    string `json:"access_secret"`
	AccessTokenExpiry string `json:"access_token_expiry"`
}
