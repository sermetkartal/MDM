package kiosk

import (
	"fmt"

	"github.com/google/uuid"
)

// SingleAppMode generates an MDM command to lock a supervised device to a single app.
// This uses the Settings command with ApplicationAttributes.
func SingleAppMode(appIdentifier string) (string, []byte) {
	cmdUUID := uuid.New().String()
	cmd := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CommandUUID</key>
	<string>%s</string>
	<key>Command</key>
	<dict>
		<key>RequestType</key>
		<string>Settings</string>
		<key>Settings</key>
		<array>
			<dict>
				<key>Item</key>
				<string>ApplicationAttributes</string>
				<key>Identifier</key>
				<string>%s</string>
				<key>Attributes</key>
				<dict/>
			</dict>
		</array>
	</dict>
</dict>
</plist>`, cmdUUID, appIdentifier)

	return cmdUUID, []byte(cmd)
}

// EnableSingleAppLock uses the Settings command to restrict the device to a single app.
// Requires supervised device.
func EnableSingleAppLock(appIdentifier string, options SingleAppOptions) (string, []byte) {
	cmdUUID := uuid.New().String()

	disableTouch := "false"
	if options.DisableTouch {
		disableTouch = "true"
	}
	disableRotation := "false"
	if options.DisableDeviceRotation {
		disableRotation = "true"
	}
	disableVolume := "false"
	if options.DisableVolumeButtons {
		disableVolume = "true"
	}
	disableRinger := "false"
	if options.DisableRingerSwitch {
		disableRinger = "true"
	}
	disableSleep := "false"
	if options.DisableSleepWake {
		disableSleep = "true"
	}
	disableAutoLock := "false"
	if options.DisableAutoLock {
		disableAutoLock = "true"
	}

	cmd := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CommandUUID</key>
	<string>%s</string>
	<key>Command</key>
	<dict>
		<key>RequestType</key>
		<string>Settings</string>
		<key>Settings</key>
		<array>
			<dict>
				<key>Item</key>
				<string>ApplicationAttributes</string>
				<key>Identifier</key>
				<string>%s</string>
				<key>Attributes</key>
				<dict>
					<key>com.apple.configuration.managed.disableTouch</key>
					<%s/>
					<key>com.apple.configuration.managed.disableDeviceRotation</key>
					<%s/>
					<key>com.apple.configuration.managed.disableVolumeButtons</key>
					<%s/>
					<key>com.apple.configuration.managed.disableRingerSwitch</key>
					<%s/>
					<key>com.apple.configuration.managed.disableSleepWakeButton</key>
					<%s/>
					<key>com.apple.configuration.managed.disableAutoLock</key>
					<%s/>
				</dict>
			</dict>
		</array>
	</dict>
</dict>
</plist>`, cmdUUID, appIdentifier,
		disableTouch, disableRotation, disableVolume,
		disableRinger, disableSleep, disableAutoLock)

	return cmdUUID, []byte(cmd)
}

// ExitSingleAppMode removes the single app lock.
func ExitSingleAppMode() (string, []byte) {
	cmdUUID := uuid.New().String()
	cmd := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CommandUUID</key>
	<string>%s</string>
	<key>Command</key>
	<dict>
		<key>RequestType</key>
		<string>Settings</string>
		<key>Settings</key>
		<array>
			<dict>
				<key>Item</key>
				<string>ApplicationAttributes</string>
				<key>Identifier</key>
				<string></string>
				<key>Attributes</key>
				<dict/>
			</dict>
		</array>
	</dict>
</dict>
</plist>`, cmdUUID)

	return cmdUUID, []byte(cmd)
}

type SingleAppOptions struct {
	DisableTouch          bool
	DisableDeviceRotation bool
	DisableVolumeButtons  bool
	DisableRingerSwitch   bool
	DisableSleepWake      bool
	DisableAutoLock       bool
}
