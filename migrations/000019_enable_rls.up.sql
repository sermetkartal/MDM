-- Enable Row-Level Security on all tenant-scoped tables
-- Each table gets: ENABLE RLS, FORCE RLS, and a policy filtering by app.current_org_id

-- Helper: set current_org_id before each request via SET LOCAL app.current_org_id = '<uuid>'
-- The superuser/migration role bypasses RLS unless FORCE is used.

-- devices
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_devices ON devices
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- policies
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policies ON policies
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- policy_assignments (join through policy, but has no org_id directly — skip if no org_id column)
-- policy_assignments does not have org_id, so we rely on the policy table's RLS.

-- commands
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_commands ON commands
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- apps
ALTER TABLE apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE apps FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_apps ON apps
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- kiosk_profiles
ALTER TABLE kiosk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_kiosk_profiles ON kiosk_profiles
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- compliance_rules
ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_compliance_rules ON compliance_rules
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- compliance_violations
ALTER TABLE compliance_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_violations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_compliance_violations ON compliance_violations
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- geofences
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofences FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_geofences ON geofences
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- geofence_events
ALTER TABLE geofence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_geofence_events ON geofence_events
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- device_groups
ALTER TABLE device_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_device_groups ON device_groups
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_users ON users
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- roles
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_roles ON roles
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- certificates
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_certificates ON certificates
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- webhooks
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_webhooks ON webhooks
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- api_keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_api_keys ON api_keys
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- enrollment_configs
ALTER TABLE enrollment_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_configs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_enrollment_configs ON enrollment_configs
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- integrations
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_integrations ON integrations
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- ldap_sync_history
ALTER TABLE ldap_sync_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ldap_sync_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_ldap_sync_history ON ldap_sync_history
  USING (org_id = current_setting('app.current_org_id')::uuid);
