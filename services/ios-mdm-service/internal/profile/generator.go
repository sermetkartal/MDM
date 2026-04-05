package profile

import (
	"fmt"

	"github.com/google/uuid"
)

// plistHeader returns the standard plist XML header.
func plistHeader() string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">`
}

// profileWrapper wraps payloads in a configuration profile envelope.
func profileWrapper(displayName, identifier, description, payloadContent string) string {
	profileUUID := uuid.New().String()
	return fmt.Sprintf(`%s
<dict>
	<key>PayloadDisplayName</key>
	<string>%s</string>
	<key>PayloadIdentifier</key>
	<string>%s</string>
	<key>PayloadUUID</key>
	<string>%s</string>
	<key>PayloadType</key>
	<string>Configuration</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
	<key>PayloadDescription</key>
	<string>%s</string>
	<key>PayloadContent</key>
	<array>
		%s
	</array>
</dict>
</plist>`, plistHeader(), displayName, identifier, profileUUID, description, payloadContent)
}

type WiFiConfig struct {
	SSID         string
	SecurityType string // WPA, WPA2, WEP, None
	Password     string
	AutoJoin     bool
	ProxyType    string // None, Manual, Auto
	ProxyServer  string
	ProxyPort    int
}

func GenerateWiFiProfile(cfg WiFiConfig) []byte {
	payloadUUID := uuid.New().String()
	autoJoin := "false"
	if cfg.AutoJoin {
		autoJoin = "true"
	}

	payload := fmt.Sprintf(`<dict>
		<key>PayloadType</key>
		<string>com.apple.wifi.managed</string>
		<key>PayloadIdentifier</key>
		<string>com.mdm.wifi.%s</string>
		<key>PayloadUUID</key>
		<string>%s</string>
		<key>PayloadVersion</key>
		<integer>1</integer>
		<key>SSID_STR</key>
		<string>%s</string>
		<key>EncryptionType</key>
		<string>%s</string>
		<key>Password</key>
		<string>%s</string>
		<key>AutoJoin</key>
		<%s/>
	</dict>`, payloadUUID, payloadUUID, cfg.SSID, cfg.SecurityType, cfg.Password, autoJoin)

	if cfg.ProxyType == "Manual" && cfg.ProxyServer != "" {
		payload = fmt.Sprintf(`<dict>
		<key>PayloadType</key>
		<string>com.apple.wifi.managed</string>
		<key>PayloadIdentifier</key>
		<string>com.mdm.wifi.%s</string>
		<key>PayloadUUID</key>
		<string>%s</string>
		<key>PayloadVersion</key>
		<integer>1</integer>
		<key>SSID_STR</key>
		<string>%s</string>
		<key>EncryptionType</key>
		<string>%s</string>
		<key>Password</key>
		<string>%s</string>
		<key>AutoJoin</key>
		<%s/>
		<key>ProxyType</key>
		<string>Manual</string>
		<key>ProxyServer</key>
		<string>%s</string>
		<key>ProxyServerPort</key>
		<integer>%d</integer>
	</dict>`, payloadUUID, payloadUUID, cfg.SSID, cfg.SecurityType, cfg.Password, autoJoin, cfg.ProxyServer, cfg.ProxyPort)
	}

	return []byte(profileWrapper(
		fmt.Sprintf("WiFi - %s", cfg.SSID),
		fmt.Sprintf("com.mdm.wifi.%s", cfg.SSID),
		"Configures WiFi network settings",
		payload,
	))
}

type VPNConfig struct {
	VPNType    string // IKEv2, IPSec
	ServerAddr string
	RemoteID   string
	LocalID    string
	AuthMethod string // Certificate, SharedSecret
	SharedSecret string
}

func GenerateVPNProfile(cfg VPNConfig) []byte {
	payloadUUID := uuid.New().String()
	payload := fmt.Sprintf(`<dict>
		<key>PayloadType</key>
		<string>com.apple.vpn.managed</string>
		<key>PayloadIdentifier</key>
		<string>com.mdm.vpn.%s</string>
		<key>PayloadUUID</key>
		<string>%s</string>
		<key>PayloadVersion</key>
		<integer>1</integer>
		<key>VPNType</key>
		<string>%s</string>
		<key>VPNSubType</key>
		<string></string>
		<key>RemoteAddress</key>
		<string>%s</string>
		<key>AuthenticationMethod</key>
		<string>%s</string>
		<key>RemoteIdentifier</key>
		<string>%s</string>
		<key>LocalIdentifier</key>
		<string>%s</string>
	</dict>`, payloadUUID, payloadUUID, cfg.VPNType, cfg.ServerAddr, cfg.AuthMethod, cfg.RemoteID, cfg.LocalID)

	return []byte(profileWrapper(
		"VPN Configuration",
		"com.mdm.vpn",
		"Configures VPN connection",
		payload,
	))
}

type PasscodeConfig struct {
	MinLength         int
	MinComplexChars   int
	MaxAgeDays        int
	MaxFailedAttempts int
	AutoLockMinutes   int
}

func GeneratePasscodeProfile(cfg PasscodeConfig) []byte {
	payloadUUID := uuid.New().String()
	payload := fmt.Sprintf(`<dict>
		<key>PayloadType</key>
		<string>com.apple.mobiledevice.passwordpolicy</string>
		<key>PayloadIdentifier</key>
		<string>com.mdm.passcode</string>
		<key>PayloadUUID</key>
		<string>%s</string>
		<key>PayloadVersion</key>
		<integer>1</integer>
		<key>minLength</key>
		<integer>%d</integer>
		<key>minComplexChars</key>
		<integer>%d</integer>
		<key>maxPINAgeInDays</key>
		<integer>%d</integer>
		<key>maxFailedAttempts</key>
		<integer>%d</integer>
		<key>maxInactivity</key>
		<integer>%d</integer>
	</dict>`, payloadUUID, cfg.MinLength, cfg.MinComplexChars, cfg.MaxAgeDays, cfg.MaxFailedAttempts, cfg.AutoLockMinutes)

	return []byte(profileWrapper(
		"Passcode Policy",
		"com.mdm.passcode",
		"Enforces device passcode requirements",
		payload,
	))
}

type RestrictionConfig struct {
	AllowCamera      *bool
	AllowScreenShot  *bool
	AllowAppInstall  *bool
	AllowSiri        *bool
	AllowiCloud      *bool
	AllowAirDrop     *bool
	AllowSafari      *bool
	AllowFaceTime    *bool
	AllowPassbook    *bool
	AllowGameCenter  *bool
}

func GenerateRestrictionProfile(cfg RestrictionConfig) []byte {
	payloadUUID := uuid.New().String()

	boolStr := func(b *bool) string {
		if b == nil || *b {
			return "true"
		}
		return "false"
	}

	payload := fmt.Sprintf(`<dict>
		<key>PayloadType</key>
		<string>com.apple.applicationaccess</string>
		<key>PayloadIdentifier</key>
		<string>com.mdm.restrictions</string>
		<key>PayloadUUID</key>
		<string>%s</string>
		<key>PayloadVersion</key>
		<integer>1</integer>
		<key>allowCamera</key>
		<%s/>
		<key>allowScreenShot</key>
		<%s/>
		<key>allowAppInstallation</key>
		<%s/>
		<key>allowAssistant</key>
		<%s/>
		<key>allowCloudBackup</key>
		<%s/>
		<key>allowAirDrop</key>
		<%s/>
		<key>allowSafari</key>
		<%s/>
		<key>allowVideoConferencing</key>
		<%s/>
		<key>allowPassbookWhileLocked</key>
		<%s/>
		<key>allowGameCenter</key>
		<%s/>
	</dict>`, payloadUUID,
		boolStr(cfg.AllowCamera),
		boolStr(cfg.AllowScreenShot),
		boolStr(cfg.AllowAppInstall),
		boolStr(cfg.AllowSiri),
		boolStr(cfg.AllowiCloud),
		boolStr(cfg.AllowAirDrop),
		boolStr(cfg.AllowSafari),
		boolStr(cfg.AllowFaceTime),
		boolStr(cfg.AllowPassbook),
		boolStr(cfg.AllowGameCenter),
	)

	return []byte(profileWrapper(
		"Restrictions",
		"com.mdm.restrictions",
		"Configures device restrictions",
		payload,
	))
}

type CertificateConfig struct {
	CertificateName string
	CertificateData []byte // DER-encoded certificate
	UseSCEP         bool
	SCEPUrl         string
	SCEPSubject     string
	SCEPChallenge   string
}

func GenerateCertificateProfile(cfg CertificateConfig) []byte {
	payloadUUID := uuid.New().String()

	if cfg.UseSCEP {
		payload := fmt.Sprintf(`<dict>
		<key>PayloadType</key>
		<string>com.apple.security.scep</string>
		<key>PayloadIdentifier</key>
		<string>com.mdm.scep</string>
		<key>PayloadUUID</key>
		<string>%s</string>
		<key>PayloadVersion</key>
		<integer>1</integer>
		<key>PayloadContent</key>
		<dict>
			<key>URL</key>
			<string>%s</string>
			<key>Subject</key>
			<array><array><array>
				<string>O</string>
				<string>%s</string>
			</array></array></array>
			<key>Challenge</key>
			<string>%s</string>
		</dict>
	</dict>`, payloadUUID, cfg.SCEPUrl, cfg.SCEPSubject, cfg.SCEPChallenge)

		return []byte(profileWrapper(
			"SCEP Certificate",
			"com.mdm.cert.scep",
			"Installs certificate via SCEP",
			payload,
		))
	}

	payload := fmt.Sprintf(`<dict>
		<key>PayloadType</key>
		<string>com.apple.security.root</string>
		<key>PayloadIdentifier</key>
		<string>com.mdm.cert.%s</string>
		<key>PayloadUUID</key>
		<string>%s</string>
		<key>PayloadVersion</key>
		<integer>1</integer>
		<key>PayloadCertificateFileName</key>
		<string>%s.cer</string>
		<key>PayloadContent</key>
		<data></data>
	</dict>`, payloadUUID, payloadUUID, cfg.CertificateName)

	return []byte(profileWrapper(
		fmt.Sprintf("Certificate - %s", cfg.CertificateName),
		fmt.Sprintf("com.mdm.cert.%s", cfg.CertificateName),
		"Installs a CA certificate",
		payload,
	))
}

type EmailConfig struct {
	AccountName    string
	AccountType    string // IMAP, Exchange
	IncomingServer string
	IncomingPort   int
	IncomingSSL    bool
	OutgoingServer string
	OutgoingPort   int
	OutgoingSSL    bool
	EmailAddress   string
}

func GenerateEmailProfile(cfg EmailConfig) []byte {
	payloadUUID := uuid.New().String()
	incomingSSL := "false"
	if cfg.IncomingSSL {
		incomingSSL = "true"
	}
	outgoingSSL := "false"
	if cfg.OutgoingSSL {
		outgoingSSL = "true"
	}

	var payloadType string
	if cfg.AccountType == "Exchange" {
		payloadType = "com.apple.eas.account"
	} else {
		payloadType = "com.apple.mail.managed"
	}

	payload := fmt.Sprintf(`<dict>
		<key>PayloadType</key>
		<string>%s</string>
		<key>PayloadIdentifier</key>
		<string>com.mdm.email.%s</string>
		<key>PayloadUUID</key>
		<string>%s</string>
		<key>PayloadVersion</key>
		<integer>1</integer>
		<key>EmailAccountName</key>
		<string>%s</string>
		<key>EmailAddress</key>
		<string>%s</string>
		<key>IncomingMailServerHostName</key>
		<string>%s</string>
		<key>IncomingMailServerPortNumber</key>
		<integer>%d</integer>
		<key>IncomingMailServerUseSSL</key>
		<%s/>
		<key>OutgoingMailServerHostName</key>
		<string>%s</string>
		<key>OutgoingMailServerPortNumber</key>
		<integer>%d</integer>
		<key>OutgoingMailServerUseSSL</key>
		<%s/>
	</dict>`, payloadType, payloadUUID, payloadUUID,
		cfg.AccountName, cfg.EmailAddress,
		cfg.IncomingServer, cfg.IncomingPort, incomingSSL,
		cfg.OutgoingServer, cfg.OutgoingPort, outgoingSSL)

	return []byte(profileWrapper(
		fmt.Sprintf("Email - %s", cfg.AccountName),
		"com.mdm.email",
		"Configures email account",
		payload,
	))
}
