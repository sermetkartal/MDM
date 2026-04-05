package enrollment

import (
	"fmt"
	"log/slog"
	"net/http"

	"github.com/google/uuid"
)

type ManualEnrollment struct {
	serverURL  string
	topic      string
	signCert   string
}

func NewManualEnrollment(serverURL, topic, signCert string) *ManualEnrollment {
	return &ManualEnrollment{
		serverURL: serverURL,
		topic:     topic,
		signCert:  signCert,
	}
}

func (m *ManualEnrollment) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /enroll/{token}", m.HandleEnroll)
}

// HandleEnroll serves the MDM enrollment profile when a user opens the enrollment URL.
func (m *ManualEnrollment) HandleEnroll(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if token == "" {
		http.Error(w, "missing enrollment token", http.StatusBadRequest)
		return
	}

	slog.Info("enrollment profile requested", "token", token, "remote_addr", r.RemoteAddr)

	profile := m.generateEnrollmentProfile(token)

	w.Header().Set("Content-Type", "application/x-apple-aspen-config")
	w.Header().Set("Content-Disposition", `attachment; filename="enrollment.mobileconfig"`)
	w.WriteHeader(http.StatusOK)
	w.Write(profile)
}

// GenerateEnrollmentURL creates a unique enrollment URL for manual enrollment.
func (m *ManualEnrollment) GenerateEnrollmentURL() string {
	token := uuid.New().String()
	return fmt.Sprintf("%s/enroll/%s", m.serverURL, token)
}

func (m *ManualEnrollment) generateEnrollmentProfile(token string) []byte {
	profileUUID := uuid.New().String()
	payloadUUID := uuid.New().String()
	identityCertUUID := uuid.New().String()

	return []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadDisplayName</key>
	<string>MDM Enrollment</string>
	<key>PayloadIdentifier</key>
	<string>com.mdm.enrollment.%s</string>
	<key>PayloadUUID</key>
	<string>%s</string>
	<key>PayloadType</key>
	<string>Configuration</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
	<key>PayloadDescription</key>
	<string>Enrolls this device in Mobile Device Management</string>
	<key>PayloadContent</key>
	<array>
		<dict>
			<key>PayloadType</key>
			<string>com.apple.mdm</string>
			<key>PayloadIdentifier</key>
			<string>com.mdm.mdm</string>
			<key>PayloadUUID</key>
			<string>%s</string>
			<key>PayloadVersion</key>
			<integer>1</integer>
			<key>ServerURL</key>
			<string>%s/mdm/command</string>
			<key>CheckInURL</key>
			<string>%s/mdm/checkin</string>
			<key>Topic</key>
			<string>%s</string>
			<key>IdentityCertificateUUID</key>
			<string>%s</string>
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
</plist>`, token, profileUUID, payloadUUID, m.serverURL, m.serverURL, m.topic, identityCertUUID))
}
