# Android Agent Guide

## Enrollment Methods

The MDM platform supports four enrollment methods for Android devices:

### QR Code Enrollment

The most common method. An admin generates a QR code in the console, and the device scans it during initial setup.

1. Navigate to **Enrollment** in the admin console
2. Click **Generate QR Code**
3. Configure enrollment settings (Wi-Fi, policies to apply)
4. On the Android device, tap the screen 6 times during the initial setup wizard
5. Scan the QR code with the device camera
6. The device downloads the MDM agent and enrolls automatically

### NFC Enrollment

For bulk provisioning. An NFC tag or programmer device is used to transfer enrollment data.

1. Create an enrollment configuration in the admin console
2. Program the NFC tag with the enrollment payload
3. Factory-reset the target device
4. Tap the NFC tag against the device during the initial "Welcome" screen
5. The device reads the NFC payload, connects to Wi-Fi, and installs the agent

### Zero-Touch Enrollment

For organizations purchasing devices through authorized resellers. Devices auto-enroll on first boot.

1. Register your organization with the Zero-Touch portal
2. Configure the MDM server URL and enrollment token in the Zero-Touch portal
3. Assign devices to your organization via the reseller
4. When a device boots for the first time, it automatically contacts the MDM server and enrolls

### Samsung Knox Mobile Enrollment (KME)

For Samsung devices purchased through Samsung business channels.

1. Register your organization in the Knox portal
2. Upload device IMEI list or configure with reseller
3. Set the MDM server profile in Knox
4. Samsung devices auto-enroll on first boot via Knox

## Device Owner Setup

The MDM agent runs as a **Device Owner** (fully managed device) or **Profile Owner** (work profile on personal device).

### Device Owner mode

- Full control over the device
- Required for kiosk mode
- Can only be set during initial device setup (factory reset required)
- Enables: wipe, lock, disable factory reset, enforce encryption

### Profile Owner mode

- Creates a separate work profile on the device
- Personal apps and data remain untouched
- Suitable for BYOD scenarios
- Enables: manage work apps, enforce work profile policies, remote wipe work profile only

## Kiosk Mode Configuration

Kiosk mode locks a device to one or more specified applications.

### Single-App Kiosk

The device runs only one application, with the navigation bar and status bar hidden.

Configuration in the admin console:
- **Mode**: Single App
- **Package Name**: e.g., `com.company.pointofsale`
- **Auto-launch**: Enable to start the app on boot
- **Lock Task Mode**: Prevent exiting the app

### Multi-App Kiosk

The device shows a custom launcher with a curated set of applications.

Configuration:
- **Mode**: Multi App
- **Allowed Apps**: List of package names
- **Custom Wallpaper**: Optional branding
- **System Settings Access**: Restrict to Wi-Fi only, or none

### Digital Signage

The device displays a URL or media in fullscreen, typically for information displays.

Configuration:
- **Mode**: Digital Signage
- **Content URL**: The webpage or media URL to display
- **Refresh Interval**: How often to reload content
- **Auto-restart**: Restart the browser on crash

## Troubleshooting

### Common Issues

| Issue | Cause | Resolution |
|-------|-------|------------|
| QR code scan fails | Camera obstructed or QR too small | Ensure good lighting, display QR at full size |
| "Not a valid MDM profile" | Wrong QR payload format | Regenerate QR code from the admin console |
| Agent crashes on install | Incompatible Android version | Check minimum SDK requirement (Android 10+) |
| Device not appearing in console | Network connectivity | Verify device has internet access and correct server URL |
| Heartbeat missing | Agent killed by battery optimization | Disable battery optimization for the MDM agent |
| Commands not executing | Agent not running as Device Owner | Factory reset and re-enroll with Device Owner setup |
| Kiosk mode not activating | Lock Task mode not granted | Ensure Device Owner is properly set up |

### Collecting Agent Logs

1. In the admin console, navigate to the device detail page
2. Click **Actions > Collect Logs**
3. The agent uploads logs to the server; download from the device detail page
4. Alternatively, use ADB: `adb logcat -s MDMAgent`

### Network Requirements

The agent requires outbound access to:

| Destination | Port | Protocol | Purpose |
|-------------|------|----------|---------|
| MDM Server | 443 | HTTPS | API communication |
| MDM Server | 50051 | gRPC/TLS | Command stream |
| FCM (Google) | 443 | HTTPS | Push notifications |
| Play Store | 443 | HTTPS | App installation |
