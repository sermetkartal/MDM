import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const devicePlatformEnum = pgEnum('device_platform', ['ios', 'android', 'windows', 'macos', 'linux']);
export const deviceStatusEnum = pgEnum('device_status', ['enrolled', 'pending', 'blocked', 'wiped', 'retired']);
export const commandStatusEnum = pgEnum('command_status', ['pending', 'queued', 'delivered', 'acknowledged', 'completed', 'failed', 'cancelled']);
export const complianceStatusEnum = pgEnum('compliance_status', ['compliant', 'non_compliant', 'unknown']);
export const webhookStatusEnum = pgEnum('webhook_status', ['active', 'inactive']);
export const appTypeEnum = pgEnum('app_type', ['public', 'enterprise', 'web_clip']);

// --- Organizations ---
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 128 }).notNull().unique(),
  settings: jsonb('settings').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Roles ---
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description'),
  permissions: jsonb('permissions').notNull().default([]),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Users ---
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 128 }),
  lastName: varchar('last_name', { length: 128 }),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('users_email_org_idx').on(table.email, table.orgId),
]);

// --- Devices ---
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  udid: varchar('udid', { length: 255 }).notNull(),
  serialNumber: varchar('serial_number', { length: 128 }),
  name: varchar('name', { length: 255 }),
  platform: devicePlatformEnum('platform').notNull(),
  osVersion: varchar('os_version', { length: 64 }),
  model: varchar('model', { length: 128 }),
  manufacturer: varchar('manufacturer', { length: 128 }),
  status: deviceStatusEnum('status').notNull().default('pending'),
  complianceStatus: complianceStatusEnum('compliance_status').notNull().default('unknown'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  enrolledAt: timestamp('enrolled_at', { withTimezone: true }),
  deviceInfo: jsonb('device_info').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('devices_udid_org_idx').on(table.udid, table.orgId),
  index('devices_org_status_idx').on(table.orgId, table.status),
]);

// --- Device Groups ---
export const groupTypeEnum = pgEnum('group_type', ['static', 'dynamic', 'ldap']);

export const deviceGroups = pgTable('device_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  parentId: uuid('parent_id'),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  type: groupTypeEnum('type').notNull().default('static'),
  isDynamic: boolean('is_dynamic').notNull().default(false),
  dynamicFilter: jsonb('dynamic_filter'),
  rules: jsonb('rules'),
  depth: integer('depth').notNull().default(0),
  ldapDn: varchar('ldap_dn', { length: 1024 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('device_groups_org_idx').on(table.orgId),
  index('device_groups_parent_idx').on(table.parentId),
]);

export const deviceGroupMembers = pgTable('device_group_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull().references(() => deviceGroups.id, { onDelete: 'cascade' }),
  deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('group_device_idx').on(table.groupId, table.deviceId),
]);

// --- Policies ---
export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  platform: devicePlatformEnum('platform').notNull(),
  version: integer('version').notNull().default(1),
  payload: jsonb('payload').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('policies_org_idx').on(table.orgId),
]);

export const policyVersions = pgTable('policy_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyId: uuid('policy_id').notNull().references(() => policies.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  payload: jsonb('payload').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const policyAssignments = pgTable('policy_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyId: uuid('policy_id').notNull().references(() => policies.id, { onDelete: 'cascade' }),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').references(() => deviceGroups.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Commands ---
export const commands = pgTable('commands', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  deviceId: uuid('device_id').notNull().references(() => devices.id),
  type: varchar('type', { length: 128 }).notNull(),
  payload: jsonb('payload').default({}),
  status: commandStatusEnum('status').notNull().default('pending'),
  result: jsonb('result'),
  issuedBy: uuid('issued_by').references(() => users.id),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('commands_device_status_idx').on(table.deviceId, table.status),
  index('commands_org_idx').on(table.orgId),
]);

// --- Apps ---
export const apps = pgTable('apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  bundleId: varchar('bundle_id', { length: 255 }).notNull(),
  platform: devicePlatformEnum('platform').notNull(),
  type: appTypeEnum('type').notNull().default('public'),
  iconUrl: text('icon_url'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('apps_org_idx').on(table.orgId),
]);

export const appVersions = pgTable('app_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  version: varchar('version', { length: 64 }).notNull(),
  downloadUrl: text('download_url'),
  releaseNotes: text('release_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const appAssignments = pgTable('app_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').references(() => deviceGroups.id, { onDelete: 'cascade' }),
  isRequired: boolean('is_required').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Kiosk Profiles ---
export const kioskProfiles = pgTable('kiosk_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  allowedApps: jsonb('allowed_apps').notNull().default([]),
  wallpaperUrl: text('wallpaper_url'),
  autoLaunchApp: varchar('auto_launch_app', { length: 255 }),
  exitPassword: varchar('exit_password', { length: 255 }),
  settings: jsonb('settings').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Compliance Rules ---
export const complianceRules = pgTable('compliance_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  condition: jsonb('condition').notNull(),
  severity: varchar('severity', { length: 32 }).notNull().default('medium'),
  action: jsonb('action').notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const complianceViolations = pgTable('compliance_violations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  deviceId: uuid('device_id').notNull().references(() => devices.id),
  ruleId: uuid('rule_id').notNull().references(() => complianceRules.id),
  details: jsonb('details').default({}),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('violations_device_idx').on(table.deviceId),
  index('violations_org_idx').on(table.orgId),
]);

// --- Geofences ---
export const geofences = pgTable('geofences', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  type: varchar('type', { length: 16 }).notNull().default('circle'),
  centerLat: varchar('center_lat', { length: 32 }).notNull().default('0'),
  centerLng: varchar('center_lng', { length: 32 }).notNull().default('0'),
  radiusMeters: integer('radius_meters').notNull().default(0),
  polygon: jsonb('polygon'),
  dwellTimeSeconds: integer('dwell_time_seconds').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const geofencePolicies = pgTable('geofence_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  geofenceId: uuid('geofence_id').notNull().references(() => geofences.id, { onDelete: 'cascade' }),
  triggerType: varchar('trigger_type', { length: 16 }).notNull(),
  actionType: varchar('action_type', { length: 32 }).notNull(),
  actionConfig: jsonb('action_config').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const geofenceEvents = pgTable('geofence_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceId: uuid('device_id').notNull(),
  geofenceId: uuid('geofence_id').notNull().references(() => geofences.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  triggerType: varchar('trigger_type', { length: 16 }).notNull(),
  latitude: varchar('latitude', { length: 32 }).notNull(),
  longitude: varchar('longitude', { length: 32 }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('geofence_events_fence_idx').on(table.geofenceId),
  index('geofence_events_device_idx').on(table.deviceId),
]);

// --- Certificates ---
export const certificates = pgTable('certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  deviceId: varchar('device_id', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 32 }).notNull().default('device'),
  thumbprint: varchar('thumbprint', { length: 128 }),
  serialNumber: varchar('serial_number', { length: 255 }),
  issuer: varchar('issuer', { length: 255 }),
  subject: varchar('subject', { length: 255 }),
  notBefore: timestamp('not_before', { withTimezone: true }),
  notAfter: timestamp('not_after', { withTimezone: true }),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  fileUrl: text('file_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('certificates_org_idx').on(table.orgId),
  index('certificates_device_idx').on(table.deviceId),
  index('certificates_status_idx').on(table.orgId, table.status),
]);

// --- Audit Logs ---
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').references(() => users.id),
  actor: varchar('actor', { length: 255 }),
  actorType: varchar('actor_type', { length: 32 }).default('user'),
  action: varchar('action', { length: 128 }).notNull(),
  resource: varchar('resource', { length: 128 }).notNull(),
  resourceId: uuid('resource_id'),
  resourceType: varchar('resource_type', { length: 128 }),
  details: jsonb('details').default({}),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_org_created_idx').on(table.orgId, table.createdAt),
  index('audit_user_idx').on(table.userId),
  index('audit_action_idx').on(table.action),
  index('audit_resource_type_idx').on(table.resourceType),
]);

// --- Enrollment Configs ---
export const enrollmentConfigs = pgTable('enrollment_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  platform: devicePlatformEnum('platform'),
  token: varchar('token', { length: 512 }).notNull().unique(),
  maxEnrollments: integer('max_enrollments'),
  currentEnrollments: integer('current_enrollments').notNull().default(0),
  defaultGroupId: uuid('default_group_id').references(() => deviceGroups.id),
  defaultPolicyId: uuid('default_policy_id').references(() => policies.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Webhooks ---
export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  url: text('url').notNull(),
  secret: varchar('secret', { length: 255 }).notNull(),
  events: jsonb('events').notNull().default([]),
  status: webhookStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  webhookId: uuid('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  event: varchar('event', { length: 128 }).notNull(),
  payload: jsonb('payload').notNull(),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- API Keys ---
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: varchar('name', { length: 255 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 16 }).notNull(),
  permissions: jsonb('permissions').notNull().default([]),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Integrations ---
export const integrationTypeEnum = pgEnum('integration_type', ['ldap', 'scim', 'google_workspace']);

export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  type: integrationTypeEnum('type').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  config: jsonb('config').notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('integrations_org_idx').on(table.orgId),
]);

export const ldapSyncHistory = pgTable('ldap_sync_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  integrationId: uuid('integration_id').notNull().references(() => integrations.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  status: varchar('status', { length: 32 }).notNull().default('running'),
  usersSynced: integer('users_synced').notNull().default(0),
  groupsSynced: integer('groups_synced').notNull().default(0),
  errors: jsonb('errors').default([]),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('ldap_sync_org_idx').on(table.orgId),
  index('ldap_sync_integration_idx').on(table.integrationId),
]);

// --- Relations ---
export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, { fields: [users.orgId], references: [organizations.id] }),
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  organization: one(organizations, { fields: [devices.orgId], references: [organizations.id] }),
  commands: many(commands),
  complianceViolations: many(complianceViolations),
}));

export const policiesRelations = relations(policies, ({ one, many }) => ({
  organization: one(organizations, { fields: [policies.orgId], references: [organizations.id] }),
  versions: many(policyVersions),
  assignments: many(policyAssignments),
}));

export const commandsRelations = relations(commands, ({ one }) => ({
  device: one(devices, { fields: [commands.deviceId], references: [devices.id] }),
  issuedByUser: one(users, { fields: [commands.issuedBy], references: [users.id] }),
}));
