-- Remove retention policies from continuous aggregates
SELECT remove_retention_policy('device_telemetry_daily', if_exists => true);
SELECT remove_retention_policy('device_telemetry_hourly', if_exists => true);

-- Remove continuous aggregate policies
SELECT remove_continuous_aggregate_policy('device_telemetry_daily', if_not_exists => true);
SELECT remove_continuous_aggregate_policy('device_telemetry_hourly', if_not_exists => true);

-- Drop continuous aggregates
DROP MATERIALIZED VIEW IF EXISTS device_telemetry_daily CASCADE;
DROP MATERIALIZED VIEW IF EXISTS device_telemetry_hourly CASCADE;

-- Drop audit log functions and archive
DROP FUNCTION IF EXISTS create_audit_log_partitions(INTEGER);
DROP FUNCTION IF EXISTS archive_old_audit_partitions(INTERVAL);
DROP TABLE IF EXISTS audit_logs_archive;
