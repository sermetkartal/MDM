-- Data retention: continuous aggregates and retention policies for device_telemetry,
-- plus audit log archival infrastructure.

-- =============================================================================
-- Continuous aggregates for device_telemetry
-- =============================================================================

-- Hourly aggregate
CREATE MATERIALIZED VIEW device_telemetry_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    device_id,
    org_id,
    avg(battery_level)::smallint AS avg_battery,
    avg(storage_free_mb)::bigint AS avg_storage,
    avg(memory_free_mb)::int AS avg_memory,
    avg(wifi_signal_dbm)::smallint AS avg_wifi,
    count(*) AS sample_count
FROM device_telemetry
GROUP BY bucket, device_id, org_id;

-- Daily aggregate
CREATE MATERIALIZED VIEW device_telemetry_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    device_id,
    org_id,
    avg(battery_level)::smallint AS avg_battery,
    min(battery_level) AS min_battery,
    max(battery_level) AS max_battery,
    avg(storage_free_mb)::bigint AS avg_storage,
    avg(memory_free_mb)::int AS avg_memory,
    avg(wifi_signal_dbm)::smallint AS avg_wifi,
    count(*) AS sample_count
FROM device_telemetry
GROUP BY bucket, device_id, org_id;

-- Continuous aggregate refresh policies
SELECT add_continuous_aggregate_policy('device_telemetry_hourly',
    start_offset    => INTERVAL '3 hours',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

SELECT add_continuous_aggregate_policy('device_telemetry_daily',
    start_offset    => INTERVAL '3 days',
    end_offset      => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day');

-- =============================================================================
-- Retention policies
-- =============================================================================

-- Raw telemetry: 90 days (already set in migration 000017, re-stated for clarity)
-- SELECT add_retention_policy('device_telemetry', INTERVAL '90 days');

-- Hourly aggregate: 1 year
SELECT add_retention_policy('device_telemetry_hourly', INTERVAL '1 year');

-- Daily aggregate: 5 years
SELECT add_retention_policy('device_telemetry_daily', INTERVAL '5 years');

-- =============================================================================
-- Audit log archival
-- =============================================================================

-- Archive table for old audit logs (same schema, no partitioning)
CREATE TABLE IF NOT EXISTS audit_logs_archive (
    id UUID,
    org_id UUID NOT NULL,
    actor_type VARCHAR(20),
    actor_id UUID,
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    detail JSONB,
    ip_address INET,
    user_agent VARCHAR(500),
    occurred_at TIMESTAMPTZ NOT NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_archive_org_occurred ON audit_logs_archive (org_id, occurred_at);

-- Function to archive old audit log partitions
-- Moves data from partitions older than the given retention interval to the archive table,
-- then drops those partitions.
CREATE OR REPLACE FUNCTION archive_old_audit_partitions(retention INTERVAL DEFAULT INTERVAL '2 years')
RETURNS void AS $$
DECLARE
    partition_rec RECORD;
    cutoff_date DATE;
    partition_start DATE;
BEGIN
    cutoff_date := (CURRENT_DATE - retention)::DATE;

    FOR partition_rec IN
        SELECT inhrelid::regclass::text AS partition_name
        FROM pg_inherits
        WHERE inhparent = 'audit_logs'::regclass
        ORDER BY inhrelid::regclass::text
    LOOP
        -- Extract date from partition name (format: audit_logs_yYYYYmMM)
        BEGIN
            partition_start := to_date(
                substring(partition_rec.partition_name FROM 'y(\d{4})m(\d{2})'),
                'YYYYMM'
            );
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;
        END;

        IF partition_start < cutoff_date THEN
            -- Move data to archive
            EXECUTE format(
                'INSERT INTO audit_logs_archive (id, org_id, actor_type, actor_id, action, resource_type, resource_id, detail, ip_address, user_agent, occurred_at)
                 SELECT id, org_id, actor_type, actor_id, action, resource_type, resource_id, detail, ip_address, user_agent, occurred_at
                 FROM %I',
                partition_rec.partition_name
            );

            -- Detach and drop the partition
            EXECUTE format('ALTER TABLE audit_logs DETACH PARTITION %I', partition_rec.partition_name);
            EXECUTE format('DROP TABLE %I', partition_rec.partition_name);

            RAISE NOTICE 'Archived and dropped partition: %', partition_rec.partition_name;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to create future audit log partitions
CREATE OR REPLACE FUNCTION create_audit_log_partitions(months_ahead INTEGER DEFAULT 3)
RETURNS void AS $$
DECLARE
    i INTEGER;
    partition_start DATE;
    partition_end DATE;
    partition_name TEXT;
BEGIN
    FOR i IN 0..months_ahead LOOP
        partition_start := date_trunc('month', CURRENT_DATE + (i || ' months')::INTERVAL)::DATE;
        partition_end := (partition_start + INTERVAL '1 month')::DATE;
        partition_name := 'audit_logs_y' || to_char(partition_start, 'YYYY') || 'm' || to_char(partition_start, 'MM');

        -- Only create if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relname = partition_name
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
                partition_name, partition_start, partition_end
            );
            RAISE NOTICE 'Created partition: %', partition_name;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create partitions for the next 3 months
SELECT create_audit_log_partitions(3);
