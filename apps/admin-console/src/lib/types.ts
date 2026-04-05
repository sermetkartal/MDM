// Re-export types used from the API client
// These mirror the types in @mdm/api-client/src/types.ts

export type Platform = "ios" | "android" | "windows" | "macos" | "linux";
export type DeviceStatus = "enrolled" | "pending" | "blocked" | "wiped" | "retired";
export type ComplianceStatus = "compliant" | "non_compliant" | "unknown";
export type CommandStatus = "pending" | "queued" | "delivered" | "acknowledged" | "completed" | "failed" | "cancelled";

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
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

export interface BulkCommandRequest {
  type: string;
  payload?: Record<string, unknown>;
  deviceIds: string[];
}

export interface BulkCommandResponse {
  data: Command[];
  count: number;
}

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

export interface PolicyAssignment {
  id: string;
  policyId: string;
  deviceId: string | null;
  groupId: string | null;
  createdAt: string;
}

export interface DeviceGroup {
  id: string;
  orgId: string;
  parentId: string | null;
  name: string;
  description: string | null;
  type: 'static' | 'dynamic' | 'ldap';
  isDynamic: boolean;
  dynamicFilter: Record<string, unknown> | null;
  rules: RuleGroup | null;
  depth: number;
  ldapDn: string | null;
  memberCount?: number;
  children?: { id: string; name: string; type: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface RuleCondition {
  field: string;
  op: string;
  value: string | string[];
}

export interface RuleGroup {
  operator: 'and' | 'or';
  conditions: (RuleCondition | RuleGroup)[];
}

export interface GroupTreeNode {
  id: string;
  name: string;
  description: string | null;
  type: string;
  memberCount: number;
  parentId: string | null;
  depth: number;
  children: GroupTreeNode[];
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
  type: 'static' | 'dynamic';
  parentId?: string | null;
  rules?: RuleGroup;
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
  parentId?: string | null;
  rules?: RuleGroup;
}

export interface GroupMember {
  id: string;
  name: string | null;
  platform: Platform;
  os_version: string | null;
  model: string | null;
  status: DeviceStatus;
  compliance_status: ComplianceStatus;
  last_seen_at: string | null;
  joined_at: string;
}

export interface LdapIntegration {
  id: string;
  orgId: string;
  type: 'ldap';
  name: string;
  config: LdapConfig;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LdapConfig {
  url: string;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  userFilter: string;
  groupFilter: string;
  userMapping: {
    email: string;
    firstName: string;
    lastName: string;
    displayName: string;
  };
  groupMapping: {
    name: string;
    description: string;
    memberAttribute: string;
  };
  syncIntervalMinutes: number;
}

export interface LdapSyncHistoryEntry {
  id: string;
  integrationId: string;
  orgId: string;
  status: string;
  usersSynced: number;
  groupsSynced: number;
  errors: string[];
  startedAt: string;
  completedAt: string | null;
}

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

// Reports
export type ReportFormat = "csv" | "pdf" | "xlsx";
export type ReportStatus = "queued" | "processing" | "completed" | "failed";

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  params: string[];
  filters: string[];
}

export interface ReportColumn {
  key: string;
  label: string;
  type?: "string" | "number" | "date" | "boolean";
}

export interface ReportData {
  title: string;
  generated_at: string;
  columns: ReportColumn[];
  rows: unknown[][];
  summary: Record<string, unknown>;
}

export interface ReportJob {
  job_id: string;
  template_id: string;
  status: ReportStatus;
  progress_percent: number;
  download_url: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface GenerateReportRequest {
  template_id: string;
  org_id: string;
  format: ReportFormat;
  params?: {
    from?: string;
    to?: string;
    filters?: Record<string, string>;
  };
}

export interface ReportSchedule {
  id: string;
  org_id: string;
  name: string;
  template_id: string;
  params: Record<string, unknown>;
  format: ReportFormat;
  cron_expression: string;
  cron_human?: string;
  recipients: string[];
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduleRequest {
  org_id: string;
  name: string;
  template_id: string;
  params?: {
    from?: string;
    to?: string;
    filters?: Record<string, string>;
  };
  format: ReportFormat;
  cron_expression: string;
  recipients: string[];
}

export interface UpdateScheduleRequest {
  name?: string;
  template_id?: string;
  params?: Record<string, unknown>;
  format?: ReportFormat;
  cron_expression?: string;
  recipients?: string[];
  is_active?: boolean;
}

// --- Geofencing ---

export type GeofenceType = "circle" | "polygon";
export type GeofenceTriggerType = "enter" | "exit" | "dwell";
export type GeofenceActionType = "lock" | "restrict" | "notify" | "enable_policy";

export interface GeofencePoint {
  lat: number;
  lng: number;
}

export interface Geofence {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  type: GeofenceType;
  centerLat: string;
  centerLng: string;
  radiusMeters: number;
  polygon: GeofencePoint[] | null;
  dwellTimeSeconds: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GeofencePolicy {
  id: string;
  geofenceId: string;
  triggerType: GeofenceTriggerType;
  actionType: GeofenceActionType;
  actionConfig: Record<string, unknown>;
  createdAt: string;
}

export interface GeofenceEvent {
  id: string;
  deviceId: string;
  geofenceId: string;
  orgId: string;
  triggerType: GeofenceTriggerType;
  latitude: string;
  longitude: string;
  occurredAt: string;
}

export interface GeofenceDeviceInside {
  deviceId: string;
  trigger: string;
  lastSeen: string;
}

export interface CreateCircleGeofenceRequest {
  type: "circle";
  name: string;
  description?: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  dwell_time_seconds?: number;
  is_active?: boolean;
}

export interface CreatePolygonGeofenceRequest {
  type: "polygon";
  name: string;
  description?: string;
  points: GeofencePoint[];
  dwell_time_seconds?: number;
  is_active?: boolean;
}

export type CreateGeofenceRequest = CreateCircleGeofenceRequest | CreatePolygonGeofenceRequest;

export interface UpdateGeofenceRequest {
  name?: string;
  description?: string;
  type?: GeofenceType;
  center_lat?: number;
  center_lng?: number;
  radius_meters?: number;
  points?: GeofencePoint[];
  dwell_time_seconds?: number;
  is_active?: boolean;
}

export interface CreateGeofencePolicyRequest {
  trigger_type: GeofenceTriggerType;
  action_type: GeofenceActionType;
  action_config?: Record<string, unknown>;
}

// --- Certificates ---

export type CertificateStatus = "active" | "revoked" | "expired";
export type CertificateType = "device" | "ca" | "client";
export type ExpiryStatus = "active" | "expiring_warning" | "expiring_critical" | "expired" | "revoked";

export interface Certificate {
  id: string;
  orgId: string;
  deviceId: string | null;
  name: string;
  type: CertificateType;
  thumbprint: string | null;
  serialNumber: string | null;
  issuer: string | null;
  subject: string | null;
  notBefore: string | null;
  notAfter: string | null;
  status: CertificateStatus;
  expiryStatus?: ExpiryStatus;
  fileUrl: string | null;
  createdAt: string;
}

export interface ListCertificatesParams extends PaginationParams {
  type?: CertificateType;
  status?: CertificateStatus;
}

export interface SCEPConfig {
  scepUrl: string;
  challengePassword: string;
  capabilities: string[];
}

// --- Audit Logs ---

export type AuditActorType = "user" | "device" | "system";

export interface AuditLog {
  id: string;
  orgId: string;
  userId: string | null;
  actor: string | null;
  actorType: string | null;
  actorDisplay: string;
  action: string;
  resource: string;
  resourceId: string | null;
  resourceType: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface ListAuditLogsParams {
  page?: number;
  page_size?: number;
  actor_type?: string;
  action?: string;
  resource_type?: string;
  from?: string;
  to?: string;
  search?: string;
}
