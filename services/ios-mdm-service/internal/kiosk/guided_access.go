package kiosk

import (
	"fmt"

	"github.com/google/uuid"
)

type GuidedAccessOptions struct {
	EnableVoiceOver       bool
	EnableZoom            bool
	EnableInvertColors    bool
	EnableAssistiveTouch  bool
	EnableVolumeButtons   bool
	EnableRingerSwitch    bool
	EnableSleepWakeButton bool
	EnableAutoLock        bool
}

// EnableGuidedAccess generates a restriction profile that enables Guided Access
// on the device with configurable accessibility options.
func EnableGuidedAccess(options GuidedAccessOptions) []byte {
	payloadUUID := uuid.New().String()
	profileUUID := uuid.New().String()

	boolPlist := func(b bool) string {
		if b {
			return "true"
		}
		return "false"
	}

	return []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadDisplayName</key>
	<string>Guided Access Configuration</string>
	<key>PayloadIdentifier</key>
	<string>com.mdm.guided-access</string>
	<key>PayloadUUID</key>
	<string>%s</string>
	<key>PayloadType</key>
	<string>Configuration</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
	<key>PayloadContent</key>
	<array>
		<dict>
			<key>PayloadType</key>
			<string>com.apple.applicationaccess</string>
			<key>PayloadIdentifier</key>
			<string>com.mdm.guided-access.restrictions</string>
			<key>PayloadUUID</key>
			<string>%s</string>
			<key>PayloadVersion</key>
			<integer>1</integer>
			<key>autonomousSingleAppModePermittedAppIDs</key>
			<array/>
			<key>allowEnablingRestrictions</key>
			<true/>
		</dict>
	</array>
	<key>GuidedAccessOptions</key>
	<dict>
		<key>enableVoiceOver</key>
		<%s/>
		<key>enableZoom</key>
		<%s/>
		<key>enableInvertColors</key>
		<%s/>
		<key>enableAssistiveTouch</key>
		<%s/>
		<key>enableVolumeButtons</key>
		<%s/>
		<key>enableRingerSwitch</key>
		<%s/>
		<key>enableSleepWakeButton</key>
		<%s/>
		<key>enableAutoLock</key>
		<%s/>
	</dict>
</dict>
</plist>`, profileUUID, payloadUUID,
		boolPlist(options.EnableVoiceOver),
		boolPlist(options.EnableZoom),
		boolPlist(options.EnableInvertColors),
		boolPlist(options.EnableAssistiveTouch),
		boolPlist(options.EnableVolumeButtons),
		boolPlist(options.EnableRingerSwitch),
		boolPlist(options.EnableSleepWakeButton),
		boolPlist(options.EnableAutoLock),
	))
}

// AutonomousSingleAppMode generates a profile that allows specified apps
// to enter and exit single app mode on their own.
func AutonomousSingleAppMode(appIdentifiers []string) []byte {
	payloadUUID := uuid.New().String()
	profileUUID := uuid.New().String()

	apps := ""
	for _, id := range appIdentifiers {
		apps += fmt.Sprintf(`
				<string>%s</string>`, id)
	}

	return []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadDisplayName</key>
	<string>Autonomous Single App Mode</string>
	<key>PayloadIdentifier</key>
	<string>com.mdm.asam</string>
	<key>PayloadUUID</key>
	<string>%s</string>
	<key>PayloadType</key>
	<string>Configuration</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
	<key>PayloadContent</key>
	<array>
		<dict>
			<key>PayloadType</key>
			<string>com.apple.applicationaccess</string>
			<key>PayloadIdentifier</key>
			<string>com.mdm.asam.restrictions</string>
			<key>PayloadUUID</key>
			<string>%s</string>
			<key>PayloadVersion</key>
			<integer>1</integer>
			<key>autonomousSingleAppModePermittedAppIDs</key>
			<array>%s
			</array>
		</dict>
	</array>
</dict>
</plist>`, profileUUID, payloadUUID, apps))
}
