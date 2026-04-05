# Admin Guide

## First-Time Setup

### 1. Create an Organization

After deploying the platform, create your first organization:

1. Open the admin console at `http://localhost:3000`
2. The first-time setup wizard will guide you through:
   - Organization name and domain
   - First admin user account (email + password)
   - Time zone and locale settings
3. After completing setup, you will be redirected to the dashboard

### 2. Add Additional Users

1. Navigate to **Settings > Users**
2. Click **Add User**
3. Enter email, name, and select a role:
   - **Admin** - Full access to all features
   - **Helpdesk** - Can view devices, send commands (lock, reboot, message), view audit logs. Cannot wipe devices or manage policies
   - **Viewer** - Read-only access to dashboards and device lists
4. The user will receive an invitation email

## Device Management Workflow

### Enrolling Devices

1. Go to **Enrollment** in the sidebar
2. Click **Generate QR Code** (or configure NFC/Zero-Touch)
3. Optionally select a Wi-Fi profile and initial policies
4. Have users scan the QR code during device setup
5. Enrolled devices will appear in the **Devices** list

### Viewing Device Details

Click any device in the **Devices** list to see:

- Hardware info (model, serial, OS version)
- Compliance status and active violations
- Installed applications
- Applied policies
- Command history
- Location (if enabled)
- Telemetry (battery, storage, memory)

### Remote Actions

From the device detail page or the bulk action bar:

| Action | Description | Permission |
|--------|-------------|------------|
| Lock | Lock the device screen immediately | Helpdesk+ |
| Reboot | Reboot the device | Helpdesk+ |
| Send Message | Display a message on the device | Helpdesk+ |
| Ring | Ring the device at full volume | Helpdesk+ |
| Collect Logs | Request diagnostic logs | Admin |
| Wipe | Factory reset the device | Admin |
| Unenroll | Remove MDM management | Admin |

## Policy Creation and Assignment

### Creating a Policy

1. Navigate to **Policies**
2. Click **Create Policy**
3. Select a policy type:
   - **Restrictions** - Disable camera, USB, Bluetooth, etc.
   - **Passcode** - Minimum length, complexity, expiry
   - **Wi-Fi** - Network SSID, security type, credentials
   - **VPN** - VPN configuration
   - **App Management** - Required/blocked apps
4. Configure the policy settings
5. Click **Save**

### Assigning Policies

1. From the Policies list, click the actions menu on a policy
2. Select **Assign**
3. Choose a target:
   - **Organization** - Applies to all devices
   - **Group** - Applies to devices in a group
   - **Device** - Applies to a specific device
4. Confirm the assignment

### Conflict Resolution

When multiple policies of the same type apply to a device:

- **Most Restrictive** (default for restrictions/passcode) - Merges all policies, taking the most restrictive value for each field
- **Device Wins** - Device-level policy overrides group and org policies
- **Org Wins** - Organization-level policy always takes precedence

Preview the effective policy for any device from the Policy details page.

## Compliance Rules

### Creating Rules

1. Navigate to **Compliance**
2. Click **Create Rule**
3. Configure:
   - **Name** - Descriptive name (e.g., "Minimum OS Version")
   - **Condition** - Field, operator, value (e.g., `os_version >= 13.0`)
   - **Severity** - Low, Medium, High, Critical
   - **Action** - What happens on violation: Alert, Restrict, Lock, Wipe
   - **Grace Period** (optional) - Hours before action is enforced
4. Save and activate the rule

### Monitoring Compliance

The Compliance dashboard shows:

- Overall compliance score (percentage of compliant devices)
- Breakdown by severity (critical, high, medium, low)
- Top violated rules
- Recently non-compliant devices

Click any violation to see device details and resolve it.

## Reports

### Generating Reports

1. Navigate to **Reports > Generate**
2. Select a template:
   - **Device Inventory** - All devices with hardware and status info
   - **Compliance Summary** - Compliance score and violation breakdown
   - **App Usage** - Installed apps across the fleet
   - **Command History** - Commands sent and their outcomes
   - **Audit Trail** - All admin actions for a date range
3. Set date range and optional filters
4. Click **Generate**
5. Download the report in CSV or PDF format

### Scheduling Reports

1. Navigate to **Reports > Scheduled**
2. Click **Schedule Report**
3. Select template, frequency (daily, weekly, monthly), and email recipients
4. Scheduled reports will be generated automatically and emailed

## SSO Configuration

### SAML 2.0

1. Navigate to **Settings > SSO**
2. Select **SAML 2.0**
3. Enter your Identity Provider details:
   - **Entity ID** - Your IdP's entity ID
   - **SSO URL** - The IdP's single sign-on URL
   - **Certificate** - The IdP's X.509 signing certificate
4. Copy the **ACS URL** and **SP Entity ID** to configure your IdP
5. Enable SSO

### OIDC

1. Navigate to **Settings > SSO**
2. Select **OpenID Connect**
3. Enter:
   - **Issuer URL** - e.g., `https://accounts.google.com`
   - **Client ID** and **Client Secret**
   - **Scopes** - `openid email profile`
4. Enable SSO

## LDAP Setup

1. Navigate to **Settings > LDAP**
2. Enter your directory server details:
   - **Server URL** - e.g., `ldaps://ldap.example.com:636`
   - **Bind DN** - e.g., `cn=admin,dc=example,dc=com`
   - **Bind Password**
   - **Base DN** - e.g., `ou=users,dc=example,dc=com`
   - **User Filter** - e.g., `(objectClass=person)`
3. Map LDAP attributes to MDM user fields (email, name, role)
4. Click **Test Connection** to verify
5. Enable LDAP sync
6. Set sync interval (default: every 6 hours)

Synced users can log in with their LDAP credentials. Group memberships can be mapped to MDM roles for automatic role assignment.
