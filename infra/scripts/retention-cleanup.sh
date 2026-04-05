#!/usr/bin/env bash
set -euo pipefail

# Data retention cleanup script
# Runs TimescaleDB retention policies and vacuums affected tables.

DB_URL="${DATABASE_URL:?DATABASE_URL must be set}"
WEBHOOK_URL="${NOTIFICATION_WEBHOOK:-}"

notify() {
    local status="$1" message="$2"
    echo "[${status}] ${message}"
    if [[ -n "${WEBHOOK_URL}" ]]; then
        curl -sf -X POST "${WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"[retention-cleanup] ${status}: ${message}\"}" || true
    fi
}

echo "Starting retention cleanup at $(date -u +%Y-%m-%dT%H:%M:%SZ)..."

# --- Run TimescaleDB retention policies manually (belt-and-suspenders) ---
echo "Refreshing continuous aggregates..."
psql "${DB_URL}" <<'SQL'
-- Refresh hourly aggregate for the last 3 hours
CALL refresh_continuous_aggregate('device_telemetry_hourly', NOW() - INTERVAL '3 hours', NOW());

-- Refresh daily aggregate for the last 3 days
CALL refresh_continuous_aggregate('device_telemetry_daily', NOW() - INTERVAL '3 days', NOW());
SQL

# --- Archive old audit log partitions ---
echo "Archiving old audit log partitions..."
psql "${DB_URL}" <<'SQL'
SELECT archive_old_audit_partitions(INTERVAL '2 years');
SQL

# --- Vacuum analyze affected tables ---
echo "Running VACUUM ANALYZE on affected tables..."
psql "${DB_URL}" <<'SQL'
VACUUM ANALYZE device_telemetry;
VACUUM ANALYZE device_telemetry_hourly;
VACUUM ANALYZE device_telemetry_daily;
VACUUM ANALYZE compliance_history;
VACUUM ANALYZE audit_logs;
VACUUM ANALYZE audit_logs_archive;
SQL

echo "Retention cleanup complete at $(date -u +%Y-%m-%dT%H:%M:%SZ)."
notify "SUCCESS" "Retention cleanup completed successfully"
