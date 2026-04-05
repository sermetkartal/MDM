#!/usr/bin/env bash
set -euo pipefail

# Backup verification script
# Restores the latest backup to a temporary database and verifies table counts.

S3_BUCKET="${S3_BACKUP_BUCKET:?S3_BACKUP_BUCKET must be set}"
S3_PREFIX="${S3_BACKUP_PREFIX:-mdm/postgres}"
PROD_DB_URL="${DATABASE_URL:?DATABASE_URL must be set}"
VERIFY_DB_URL="${VERIFY_DATABASE_URL:-postgres://mdm:mdm@localhost:5432/mdm_verify?sslmode=disable}"
WEBHOOK_URL="${NOTIFICATION_WEBHOOK:-}"
RESTORE_DIR="/tmp/backup-verify"

mkdir -p "${RESTORE_DIR}"

cleanup() {
    rm -f "${RESTORE_DIR}"/verify_*.dump
    # Drop the verification database
    psql "${PROD_DB_URL}" -c "DROP DATABASE IF EXISTS mdm_verify;" 2>/dev/null || true
}
trap cleanup EXIT

notify() {
    local status="$1" message="$2"
    echo "[${status}] ${message}"
    if [[ -n "${WEBHOOK_URL}" ]]; then
        curl -sf -X POST "${WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"[backup-verify] ${status}: ${message}\"}" || true
    fi
}

# --- Create temporary verification database ---
echo "Creating verification database..."
psql "${PROD_DB_URL}" -c "DROP DATABASE IF EXISTS mdm_verify;"
psql "${PROD_DB_URL}" -c "CREATE DATABASE mdm_verify;"

# --- Download latest backup ---
echo "Finding latest backup..."
BACKUP_FILE_NAME=$(aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/daily/" | sort | tail -n 1 | awk '{print $4}')
if [[ -z "${BACKUP_FILE_NAME}" ]]; then
    notify "FAILURE" "No backups found"
    exit 1
fi

LOCAL_FILE="${RESTORE_DIR}/verify_restore.dump"
echo "Downloading ${BACKUP_FILE_NAME}..."
aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}/daily/${BACKUP_FILE_NAME}" "${LOCAL_FILE}"

# --- Restore to verification database ---
echo "Restoring to verification database..."
pg_restore --dbname="${VERIFY_DB_URL}" --no-owner --no-privileges "${LOCAL_FILE}" 2>/dev/null || true

# --- Compare table counts ---
echo ""
echo "=== Backup Verification Report ==="
echo "Backup file: ${BACKUP_FILE_NAME}"
echo ""

TABLES=(
    "organizations"
    "users"
    "devices"
    "device_groups"
    "policies"
    "commands"
    "compliance_rules"
    "geofences"
    "certificates"
)

DISCREPANCIES=0
for table in "${TABLES[@]}"; do
    PROD_COUNT=$(psql "${PROD_DB_URL}" -t -c "SELECT COUNT(*) FROM ${table};" 2>/dev/null | tr -d ' ' || echo "N/A")
    VERIFY_COUNT=$(psql "${VERIFY_DB_URL}" -t -c "SELECT COUNT(*) FROM ${table};" 2>/dev/null | tr -d ' ' || echo "N/A")

    if [[ "${PROD_COUNT}" == "${VERIFY_COUNT}" ]]; then
        echo "  [OK]   ${table}: ${PROD_COUNT} rows"
    else
        echo "  [DIFF] ${table}: prod=${PROD_COUNT} backup=${VERIFY_COUNT}"
        DISCREPANCIES=$((DISCREPANCIES + 1))
    fi
done

echo ""
if [[ "${DISCREPANCIES}" -gt 0 ]]; then
    notify "WARNING" "Backup verification found ${DISCREPANCIES} discrepancies in ${BACKUP_FILE_NAME}"
    echo "Verification completed with ${DISCREPANCIES} discrepancies."
    exit 1
else
    notify "SUCCESS" "Backup verification passed for ${BACKUP_FILE_NAME}"
    echo "Verification passed. All table counts match."
fi
