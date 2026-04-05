-- Disable Row-Level Security on all tenant-scoped tables

DROP POLICY IF EXISTS tenant_isolation_devices ON devices;
ALTER TABLE devices DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policies ON policies;
ALTER TABLE policies DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_commands ON commands;
ALTER TABLE commands DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_apps ON apps;
ALTER TABLE apps DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_kiosk_profiles ON kiosk_profiles;
ALTER TABLE kiosk_profiles DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_compliance_rules ON compliance_rules;
ALTER TABLE compliance_rules DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_compliance_violations ON compliance_violations;
ALTER TABLE compliance_violations DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_geofences ON geofences;
ALTER TABLE geofences DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_geofence_events ON geofence_events;
ALTER TABLE geofence_events DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_audit_logs ON audit_logs;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_device_groups ON device_groups;
ALTER TABLE device_groups DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_users ON users;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_roles ON roles;
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_certificates ON certificates;
ALTER TABLE certificates DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_webhooks ON webhooks;
ALTER TABLE webhooks DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_api_keys ON api_keys;
ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_enrollment_configs ON enrollment_configs;
ALTER TABLE enrollment_configs DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_integrations ON integrations;
ALTER TABLE integrations DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_ldap_sync_history ON ldap_sync_history;
ALTER TABLE ldap_sync_history DISABLE ROW LEVEL SECURITY;
