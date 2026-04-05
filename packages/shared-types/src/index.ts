// Device types
export type EnrollmentStatus = 'pending' | 'enrolled' | 'unenrolling' | 'unenrolled';
export type ComplianceState = 'compliant' | 'non_compliant' | 'pending' | 'unknown';
export type DeviceOSType = 'android' | 'ios' | 'ipados' | 'macos';

export type IOSSupervisionStatus = 'unsupervised' | 'supervised';
export type IOSEnrollmentType = 'manual' | 'dep';
export type MDMCommandRequestType =
  | 'DeviceLock' | 'EraseDevice' | 'ClearPasscode'
  | 'DeviceInformation' | 'InstalledApplicationList'
  | 'InstallApplication' | 'RemoveApplication'
  | 'InstallProfile' | 'RemoveProfile'
  | 'Restrictions' | 'EnableLostMode' | 'DisableLostMode'
  | 'DeviceLocation' | 'Settings';

export type ConfigProfileType =
  | 'wifi' | 'vpn' | 'passcode' | 'restriction'
  | 'certificate' | 'email' | 'scep';

export type CommandType =
  | 'lock' | 'unlock' | 'wipe' | 'selective_wipe' | 'reboot'
  | 'install_app' | 'uninstall_app' | 'set_policy' | 'clear_passcode'
  | 'enable_kiosk' | 'disable_kiosk' | 'request_location'
  | 'send_message' | 'remote_shell' | 'ring_device'
  | 'set_brightness' | 'set_volume';

export type CommandStatus =
  | 'pending' | 'queued' | 'sent' | 'delivered'
  | 'acknowledged' | 'completed' | 'failed' | 'expired' | 'cancelled';

export type PolicyType =
  | 'restriction' | 'wifi' | 'vpn' | 'passcode' | 'kiosk'
  | 'app_management' | 'compliance' | 'geofence' | 'certificate' | 'custom';

export type KioskMode = 'single_app' | 'multi_app' | 'digital_signage' | 'web_kiosk';

export type ComplianceSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ComplianceAction = 'alert' | 'restrict' | 'wipe' | 'lock' | 'notify';

// Entity interfaces
export interface Organization {
  id: string;
  name: string;
  slug: string;
  subscription: Record<string, unknown>;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  org_id: string;
  email: string;
  display_name: string;
  mfa_enabled: boolean;
  status: 'active' | 'inactive' | 'suspended';
  last_login_at: string | null;
  created_at: string;
}

export interface Role {
  id: string;
  org_id: string;
  name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
}

export interface Device {
  id: string;
  org_id: string;
  serial_number: string;
  hardware_id: string;
  model: string;
  manufacturer: string;
  os_type: DeviceOSType;
  os_version: string;
  agent_version: string;
  enrollment_status: EnrollmentStatus;
  compliance_state: ComplianceState;
  last_seen_at: string | null;
  enrolled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceGroup {
  id: string;
  org_id: string;
  name: string;
  description: string;
  type: 'static' | 'dynamic';
  rules: Record<string, unknown> | null;
  parent_id: string | null;
}

export interface Policy {
  id: string;
  org_id: string;
  name: string;
  type: PolicyType;
  priority: number;
  payload: Record<string, unknown>;
  version: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Command {
  id: string;
  org_id: string;
  device_id: string;
  type: CommandType;
  payload: Record<string, unknown> | null;
  status: CommandStatus;
  priority: number;
  retry_count: number;
  max_retries: number;
  expires_at: string | null;
  issued_by: string;
  created_at: string;
}

export interface App {
  id: string;
  org_id: string;
  package_name: string;
  name: string;
  description: string;
  type: 'enterprise' | 'public' | 'web_clip';
  icon_url: string;
  is_managed: boolean;
}

export interface KioskProfile {
  id: string;
  org_id: string;
  name: string;
  mode: KioskMode;
  config: KioskConfig;
  wallpaper_url: string | null;
  is_active: boolean;
}

export interface KioskConfig {
  allowed_packages?: string[];
  primary_package?: string;
  lock_task_mode: boolean;
  exit_pin_encrypted: string;
  auto_launch_app?: string;
  hide_status_bar: boolean;
  hide_navigation_bar: boolean;
  disable_power_button: boolean;
  screen_timeout_seconds: number;
  screen_brightness: number;
  orientation: 'portrait' | 'landscape' | 'auto';
  emergency_call_allowed: boolean;
  signage_playlist?: SignageItem[];
  web_kiosk_urls?: string[];
}

export interface SignageItem {
  type: 'image' | 'video' | 'web' | 'html';
  url: string;
  duration_seconds: number;
}

export interface ComplianceRule {
  id: string;
  org_id: string;
  name: string;
  condition: Record<string, unknown>;
  severity: ComplianceSeverity;
  action: ComplianceAction;
  action_config: Record<string, unknown> | null;
  is_active: boolean;
}

export interface Geofence {
  id: string;
  org_id: string;
  name: string;
  type: 'circle' | 'polygon';
  center_lat?: number;
  center_lng?: number;
  radius_meters?: number;
  polygon?: [number, number][];
}

export interface AuditLog {
  id: string;
  org_id: string;
  actor_type: 'user' | 'system' | 'device' | 'api_key';
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  detail: Record<string, unknown>;
  ip_address: string;
  occurred_at: string;
}

// iOS MDM types
export interface IOSDevice {
  id: string;
  org_id: string;
  udid: string;
  serial_number: string;
  device_name: string;
  model: string;
  model_name: string;
  product_name: string;
  os_version: string;
  build_version: string;
  imei: string;
  meid: string;
  supervision_status: IOSSupervisionStatus;
  enrollment_type: IOSEnrollmentType;
  dep_profile_uuid: string | null;
  is_activation_locked: boolean;
  last_seen_at: string | null;
  enrolled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConfigProfile {
  id: string;
  org_id: string;
  payload_identifier: string;
  payload_uuid: string;
  payload_type: ConfigProfileType;
  name: string;
  description: string;
  signed: boolean;
  created_at: string;
}

export interface DEPDevice {
  serial_number: string;
  model: string;
  description: string;
  color: string;
  profile_status: string;
  profile_uuid: string;
  device_family: string;
  os: string;
  synced_at: string;
}

export interface AppleSettings {
  apns_cert_uploaded: boolean;
  apns_cert_expiry: string | null;
  apns_topic: string | null;
  dep_token_configured: boolean;
  dep_server_name: string | null;
  mdm_signing_cert_uploaded: boolean;
}

// API response types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Permission constants
export const PERMISSIONS = {
  DEVICES_READ: 'devices:read',
  DEVICES_WRITE: 'devices:write',
  DEVICES_REMOTE_ACTION: 'devices:remote-action',
  POLICIES_READ: 'policies:read',
  POLICIES_WRITE: 'policies:write',
  POLICIES_DEPLOY: 'policies:deploy',
  APPS_READ: 'apps:read',
  APPS_UPLOAD: 'apps:upload',
  APPS_ASSIGN: 'apps:assign',
  GROUPS_READ: 'groups:read',
  GROUPS_WRITE: 'groups:write',
  COMPLIANCE_READ: 'compliance:read',
  COMPLIANCE_CONFIGURE: 'compliance:configure',
  REPORTS_READ: 'reports:read',
  REPORTS_CREATE: 'reports:create',
  REPORTS_SCHEDULE: 'reports:schedule',
  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',
  USERS_READ: 'users:read',
  USERS_MANAGE: 'users:manage',
  AUDIT_READ: 'audit:read',
  ENROLLMENT_MANAGE: 'enrollment:manage',
} as const;
