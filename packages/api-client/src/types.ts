// Enums
export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'linux';
export type DeviceStatus = 'enrolled' | 'pending' | 'blocked' | 'wiped' | 'retired';
export type ComplianceStatus = 'compliant' | 'non_compliant' | 'unknown';
export type CommandStatus = 'pending' | 'queued' | 'delivered' | 'acknowledged' | 'completed' | 'failed' | 'cancelled';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type AppType = 'public' | 'enterprise' | 'web_clip';
export type WebhookStatus = 'active' | 'inactive';

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

export interface DataResponse<T> {
  data: T[];
}

// Auth
export interface LoginRequest {
  email: string;
  password: string;
  orgId?: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Device
export interface Device {
  id: string;
  orgId: string;
  udid: string;
  serialNumber: string | null;
  name: string | null;
  platform: Platform;
  osVersion: string | null;
  model: string | null;
  manufacturer: string | null;
  status: DeviceStatus;
  complianceStatus: ComplianceStatus;
  lastSeenAt: string | null;
  enrolledAt: string | null;
  deviceInfo: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ListDevicesParams extends PaginationParams {
  status?: DeviceStatus;
  platform?: Platform;
  search?: string;
  complianceStatus?: ComplianceStatus;
}

export interface DevicePolicy {
  assignmentId: string;
  policyId: string;
  policyName: string;
  platform: Platform;
  version: number;
  assignedAt: string;
}

export interface DeviceApp {
  assignmentId: string;
  appId: string;
  appName: string;
  bundleId: string;
  isRequired: boolean;
  assignedAt: string;
}

export interface DeviceViolation {
  violationId: string;
  ruleId: string;
  ruleName: string;
  severity: string;
  details: Record<string, unknown>;
  resolvedAt: string | null;
  createdAt: string;
}

export interface SendCommandRequest {
  type: string;
  payload?: Record<string, unknown>;
}

// Policy
export interface Policy {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  platform: Platform;
  version: number;
  payload: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePolicyRequest {
  name: string;
  description?: string;
  platform: Platform;
  payload: Record<string, unknown>;
}

export interface UpdatePolicyRequest {
  name?: string;
  description?: string;
  payload?: Record<string, unknown>;
  isActive?: boolean;
}

export interface PolicyAssignmentRequest {
  deviceId?: string;
  groupId?: string;
}

export interface PolicyVersion {
  id: string;
  policyId: string;
  version: number;
  payload: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

export interface PolicyAssignment {
  id: string;
  policyId: string;
  deviceId: string | null;
  groupId: string | null;
  createdAt: string;
}

// Group
export interface DeviceGroup {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  isDynamic: boolean;
  dynamicFilter: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
  isDynamic?: boolean;
  dynamicFilter?: Record<string, unknown>;
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
  dynamicFilter?: Record<string, unknown>;
}

export interface GroupMember {
  id: string;
  groupId: string;
  deviceId: string;
  createdAt: string;
}

// Command
export interface Command {
  id: string;
  orgId: string;
  deviceId: string;
  type: string;
  payload: Record<string, unknown>;
  status: CommandStatus;
  result: Record<string, unknown> | null;
  issuedBy: string | null;
  issuedAt: string;
  deliveredAt: string | null;
  completedAt: string | null;
}

export interface ListCommandsParams extends PaginationParams {
  status?: CommandStatus;
  type?: string;
  deviceId?: string;
}

export interface BulkCommandRequest {
  type: string;
  payload?: Record<string, unknown>;
  deviceIds: string[];
}

export interface BulkCommandResponse {
  data: Command[];
  count: number;
}

// App
export interface App {
  id: string;
  orgId: string;
  name: string;
  bundleId: string;
  platform: Platform;
  type: AppType;
  iconUrl: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppRequest {
  name: string;
  bundleId: string;
  platform: Platform;
  type?: AppType;
  iconUrl?: string;
  description?: string;
}

export interface UpdateAppRequest {
  name?: string;
  iconUrl?: string;
  description?: string;
}

export interface CreateAppVersionRequest {
  version: string;
  downloadUrl?: string;
  releaseNotes?: string;
}

export interface AppVersion {
  id: string;
  appId: string;
  version: string;
  downloadUrl: string | null;
  releaseNotes: string | null;
  createdAt: string;
}

export interface AppAssignmentRequest {
  deviceId?: string;
  groupId?: string;
  isRequired?: boolean;
}

export interface AppAssignment {
  id: string;
  appId: string;
  deviceId: string | null;
  groupId: string | null;
  isRequired: boolean;
  createdAt: string;
}

// Kiosk Profile
export interface KioskProfile {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  allowedApps: string[];
  wallpaperUrl: string | null;
  autoLaunchApp: string | null;
  exitPassword: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKioskProfileRequest {
  name: string;
  description?: string;
  allowedApps?: string[];
  wallpaperUrl?: string;
  autoLaunchApp?: string;
  exitPassword?: string;
  settings?: Record<string, unknown>;
}

export type UpdateKioskProfileRequest = Partial<CreateKioskProfileRequest>;

// Compliance
export interface ComplianceRule {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  condition: Record<string, unknown>;
  severity: Severity;
  action: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateComplianceRuleRequest {
  name: string;
  description?: string;
  condition: Record<string, unknown>;
  severity?: Severity;
  action?: Record<string, unknown>;
  isActive?: boolean;
}

export type UpdateComplianceRuleRequest = Partial<CreateComplianceRuleRequest>;

export interface ComplianceStatusSummary {
  compliant: number;
  nonCompliant: number;
  unknown: number;
}

export interface ComplianceViolation {
  id: string;
  orgId: string;
  deviceId: string;
  ruleId: string;
  details: Record<string, unknown>;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ListViolationsParams extends PaginationParams {
  resolved?: string;
}

// Geofence
export interface Geofence {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  latitude: string;
  longitude: string;
  radiusMeters: number;
  action: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGeofenceRequest {
  name: string;
  description?: string;
  latitude: string;
  longitude: string;
  radiusMeters: number;
  action?: Record<string, unknown>;
  isActive?: boolean;
}

export type UpdateGeofenceRequest = Partial<CreateGeofenceRequest>;

// Audit Log
export interface AuditLog {
  id: string;
  orgId: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface ListAuditLogsParams extends PaginationParams {
  action?: string;
  resource?: string;
  userId?: string;
  from?: string;
  to?: string;
}

// Webhook
export interface Webhook {
  id: string;
  orgId: string;
  url: string;
  events: string[];
  status: WebhookStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookWithSecret extends Webhook {
  secret: string;
}

export interface CreateWebhookRequest {
  url: string;
  events: string[];
  status?: WebhookStatus;
}

export interface UpdateWebhookRequest {
  url?: string;
  events?: string[];
  status?: WebhookStatus;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  responseBody: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

// Enrollment
export interface EnrollmentConfig {
  id: string;
  orgId: string;
  name: string;
  platform: Platform | null;
  token: string;
  maxEnrollments: number | null;
  currentEnrollments: number;
  defaultGroupId: string | null;
  defaultPolicyId: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEnrollmentConfigRequest {
  name: string;
  platform?: Platform;
  maxEnrollments?: number;
  defaultGroupId?: string;
  defaultPolicyId?: string;
  expiresAt?: string;
}

export interface EnrollmentQrResponse {
  enrollmentToken: string;
  platform: Platform | null;
  configId: string;
  qrData: string;
}

// Error
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  requestId?: string;
}
