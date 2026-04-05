package mdm

import (
	"encoding/base64"
	"fmt"

	"github.com/google/uuid"
)

// plistCommand wraps a command in proper MDM plist format.
func plistCommand(commandUUID string, requestType string, innerXML string) []byte {
	return []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CommandUUID</key>
	<string>%s</string>
	<key>Command</key>
	<dict>
		<key>RequestType</key>
		<string>%s</string>%s
	</dict>
</dict>
</plist>`, commandUUID, requestType, innerXML))
}

func newCommandUUID() string {
	return uuid.New().String()
}

func DeviceLock(pin string) (string, []byte) {
	cmdUUID := newCommandUUID()
	inner := ""
	if pin != "" {
		inner = fmt.Sprintf(`
		<key>PIN</key>
		<string>%s</string>`, pin)
	}
	return cmdUUID, plistCommand(cmdUUID, "DeviceLock", inner)
}

func EraseDevice() (string, []byte) {
	cmdUUID := newCommandUUID()
	return cmdUUID, plistCommand(cmdUUID, "EraseDevice", "")
}

func ClearPasscode() (string, []byte) {
	cmdUUID := newCommandUUID()
	return cmdUUID, plistCommand(cmdUUID, "ClearPasscode", "")
}

func DeviceInformation(queries []string) (string, []byte) {
	cmdUUID := newCommandUUID()
	inner := `
		<key>Queries</key>
		<array>`
	for _, q := range queries {
		inner += fmt.Sprintf(`
			<string>%s</string>`, q)
	}
	inner += `
		</array>`
	return cmdUUID, plistCommand(cmdUUID, "DeviceInformation", inner)
}

func InstalledApplicationList() (string, []byte) {
	cmdUUID := newCommandUUID()
	return cmdUUID, plistCommand(cmdUUID, "InstalledApplicationList", "")
}

func InstallApplication(manifestURL string) (string, []byte) {
	cmdUUID := newCommandUUID()
	inner := fmt.Sprintf(`
		<key>ManifestURL</key>
		<string>%s</string>
		<key>ManagementFlags</key>
		<integer>1</integer>`, manifestURL)
	return cmdUUID, plistCommand(cmdUUID, "InstallApplication", inner)
}

func RemoveApplication(identifier string) (string, []byte) {
	cmdUUID := newCommandUUID()
	inner := fmt.Sprintf(`
		<key>Identifier</key>
		<string>%s</string>`, identifier)
	return cmdUUID, plistCommand(cmdUUID, "RemoveApplication", inner)
}

func InstallProfile(profileData []byte) (string, []byte) {
	cmdUUID := newCommandUUID()
	b64 := base64.StdEncoding.EncodeToString(profileData)
	inner := fmt.Sprintf(`
		<key>Payload</key>
		<data>%s</data>`, b64)
	return cmdUUID, plistCommand(cmdUUID, "InstallProfile", inner)
}

func RemoveProfile(identifier string) (string, []byte) {
	cmdUUID := newCommandUUID()
	inner := fmt.Sprintf(`
		<key>Identifier</key>
		<string>%s</string>`, identifier)
	return cmdUUID, plistCommand(cmdUUID, "RemoveProfile", inner)
}

func Restrictions(profileData []byte) (string, []byte) {
	cmdUUID := newCommandUUID()
	b64 := base64.StdEncoding.EncodeToString(profileData)
	inner := fmt.Sprintf(`
		<key>ProfileList</key>
		<data>%s</data>`, b64)
	return cmdUUID, plistCommand(cmdUUID, "Restrictions", inner)
}

func EnableLostMode(message, phoneNumber string) (string, []byte) {
	cmdUUID := newCommandUUID()
	inner := fmt.Sprintf(`
		<key>Message</key>
		<string>%s</string>
		<key>PhoneNumber</key>
		<string>%s</string>`, message, phoneNumber)
	return cmdUUID, plistCommand(cmdUUID, "EnableLostMode", inner)
}

func DisableLostMode() (string, []byte) {
	cmdUUID := newCommandUUID()
	return cmdUUID, plistCommand(cmdUUID, "DisableLostMode", "")
}

func DeviceLocation() (string, []byte) {
	cmdUUID := newCommandUUID()
	return cmdUUID, plistCommand(cmdUUID, "DeviceLocation", "")
}
