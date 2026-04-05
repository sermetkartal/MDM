package dep

import "github.com/sermetkartal/mdm/services/ios-mdm-service/internal/model"

// DefaultSkipSetupItems are the setup assistant steps commonly skipped for DEP-enrolled devices.
var DefaultSkipSetupItems = []string{
	"Location",
	"Restore",
	"Android",
	"AppleID",
	"TOS",
	"Siri",
	"Diagnostics",
	"Biometric",
	"Payment",
	"Zoom",
	"ScreenTime",
	"SoftwareUpdate",
	"Appearance",
	"Privacy",
	"Welcome",
	"iMessageAndFaceTime",
}

// NewDefaultDEPProfile creates a DEP enrollment profile with standard MDM settings.
func NewDefaultDEPProfile(serverURL, orgName string) model.DEPProfile {
	return model.DEPProfile{
		ProfileName:           orgName + " MDM Enrollment",
		URL:                   serverURL + "/mdm/checkin",
		AllowPairing:          true,
		IsSupervised:          true,
		IsMultiUser:           false,
		IsMandatory:           true,
		AwaitDeviceConfigured: true,
		IsRemovable:           false,
		Department:            orgName,
		SkipSetupItems:        DefaultSkipSetupItems,
	}
}

// NewCustomDEPProfile creates a DEP profile with custom skip steps and supervision.
func NewCustomDEPProfile(serverURL, name string, supervised, mandatory bool, skipItems []string) model.DEPProfile {
	return model.DEPProfile{
		ProfileName:           name,
		URL:                   serverURL + "/mdm/checkin",
		AllowPairing:          true,
		IsSupervised:          supervised,
		IsMandatory:           mandatory,
		AwaitDeviceConfigured: true,
		IsRemovable:           !mandatory,
		SkipSetupItems:        skipItems,
	}
}
