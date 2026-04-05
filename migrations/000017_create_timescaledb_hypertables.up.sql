CREATE TABLE device_telemetry (
    time TIMESTAMPTZ NOT NULL,
    device_id UUID NOT NULL,
    org_id UUID NOT NULL,
    battery_level SMALLINT,
    storage_free_mb BIGINT,
    memory_free_mb INTEGER,
    wifi_signal_dbm SMALLINT,
    cellular_signal_dbm SMALLINT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    extra JSONB
);

SELECT create_hypertable('device_telemetry', 'time');

ALTER TABLE device_telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id, org_id'
);

SELECT add_compression_policy('device_telemetry', INTERVAL '7 days');
SELECT add_retention_policy('device_telemetry', INTERVAL '90 days');

CREATE TABLE compliance_history (
    time TIMESTAMPTZ NOT NULL,
    device_id UUID NOT NULL,
    org_id UUID NOT NULL,
    rule_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL,
    detail JSONB
);

SELECT create_hypertable('compliance_history', 'time');
