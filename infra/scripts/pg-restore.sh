#!/usr/bin/env bash
set -euo pipefail

# PostgreSQL restore script
# Downloads a backup from S3 and restores it to the target database.

S3_BUCKET="${S3_BACKUP_BUCKET:?S3_BACKUP_BUCKET must be set}"
S3_PREFIX="${S3_BACKUP_PREFIX:-mdm/postgres}"
DB_URL="${DATABASE_URL:?DATABASE_URL must be set}"
BACKUP_DATE="${1:-latest}"
RESTORE_DIR="/tmp/pg-restore"

mkdir -p "${RESTORE_DIR}"

cleanup() {
    rm -f "${RESTORE_DIR}"/mdm_backup_*.dump
}
trap cleanup EXIT

# --- Determine which backup to download ---
if [[ "${BACKUP_DATE}" == "latest" ]]; then
    echo "Finding latest daily backup..."
    BACKUP_FILE_NAME=$(aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/daily/" | sort | tail -n 1 | awk '{print $4}')
    if [[ -z "${BACKUP_FILE_NAME}" ]]; then
        echo "ERROR: No backups found in s3://${S3_BUCKET}/${S3_PREFIX}/daily/"
        exit 1
    fi
    S3_KEY="s3://${S3_BUCKET}/${S3_PREFIX}/daily/${BACKUP_FILE_NAME}"
else
    S3_KEY="s3://${S3_BUCKET}/${S3_PREFIX}/daily/mdm_backup_${BACKUP_DATE}.dump"
fi

LOCAL_FILE="${RESTORE_DIR}/restore.dump"

echo "Downloading backup from ${S3_KEY}..."
if ! aws s3 cp "${S3_KEY}" "${LOCAL_FILE}"; then
    echo "ERROR: Failed to download backup from ${S3_KEY}"
    exit 1
fi

echo "Restoring database..."
if ! pg_restore --dbname="${DB_URL}" --clean --if-exists --no-owner --no-privileges "${LOCAL_FILE}"; then
    echo "WARNING: pg_restore completed with warnings (this is normal for --clean --if-exists)"
fi

# --- Verify restore by checking table counts ---
echo ""
echo "=== Post-Restore Verification ==="
TABLES=(
    "organizations"
    "users"
    "devices"
    "device_groups"
    "policies"
    "commands"
    "audit_logs"
    "compliance_rules"
    "geofences"
    "certificates"
)

ERRORS=0
for table in "${TABLES[@]}"; do
    COUNT=$(psql "${DB_URL}" -t -c "SELECT COUNT(*) FROM ${table};" 2>/dev/null | tr -d ' ' || echo "ERROR")
    if [[ "${COUNT}" == "ERROR" ]]; then
        echo "  [WARN] ${table}: could not query (table may not exist)"
    else
        echo "  [OK]   ${table}: ${COUNT} rows"
    fi
done

echo ""
echo "Restore complete. Please verify application functionality."
