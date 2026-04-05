package enrollment

import (
	"log/slog"
	"net/http"
)

// DEPEnrollment handles the automatic enrollment flow for DEP/ABM devices.
// When a DEP device activates:
// 1. Device contacts Apple activation servers
// 2. Apple redirects device to MDM server URL from DEP profile
// 3. Device sends Authenticate check-in (handled by MDM server)
// 4. Device sends TokenUpdate check-in (handled by MDM server)
// 5. Device is fully enrolled — no user interaction for supervised devices
type DEPEnrollment struct {
	serverURL string
	topic     string
}

func NewDEPEnrollment(serverURL, topic string) *DEPEnrollment {
	return &DEPEnrollment{
		serverURL: serverURL,
		topic:     topic,
	}
}

func (d *DEPEnrollment) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /dep/enroll", d.HandleDEPEnroll)
}

// HandleDEPEnroll is called when a DEP device is redirected to the MDM server.
// The device will proceed to the standard MDM check-in flow.
func (d *DEPEnrollment) HandleDEPEnroll(w http.ResponseWriter, r *http.Request) {
	slog.Info("DEP enrollment request received", "remote_addr", r.RemoteAddr, "user_agent", r.UserAgent())

	// For DEP enrollment, we serve the same MDM profile but with supervised settings.
	// The device will then proceed to the check-in flow automatically.
	profile := d.generateDEPEnrollmentProfile()

	w.Header().Set("Content-Type", "application/x-apple-aspen-config")
	w.WriteHeader(http.StatusOK)
	w.Write(profile)
}

func (d *DEPEnrollment) generateDEPEnrollmentProfile() []byte {
	return []byte(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadDisplayName</key>
	<string>MDM DEP Enrollment</string>
	<key>PayloadIdentifier</key>
	<string>com.mdm.dep.enrollment</string>
	<key>PayloadType</key>
	<string>Configuration</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
	<key>PayloadDescription</key>
	<string>Automatic MDM enrollment for supervised devices</string>
	<key>PayloadContent</key>
	<array>
		<dict>
			<key>PayloadType</key>
			<string>com.apple.mdm</string>
			<key>PayloadIdentifier</key>
			<string>com.mdm.dep.mdm</string>
			<key>PayloadVersion</key>
			<integer>1</integer>
			<key>ServerURL</key>
			<string>` + d.serverURL + `/mdm/command</string>
			<key>CheckInURL</key>
			<string>` + d.serverURL + `/mdm/checkin</string>
			<key>Topic</key>
			<string>` + d.topic + `</string>
			<key>AccessRights</key>
			<integer>8191</integer>
			<key>CheckOutWhenRemoved</key>
			<true/>
			<key>ServerCapabilities</key>
			<array>
				<string>com.apple.mdm.per-user-connections</string>
			</array>
		</dict>
	</array>
</dict>
</plist>`)
}
