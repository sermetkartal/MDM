#!/usr/bin/env bash
set -euo pipefail

# PostgreSQL backup script
# Dumps the MDM database in custom format with compression and uploads to S3.
# Retention: 30 daily backups + 12 monthly backups.

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
DATE_TAG=$(date -u +"%Y-%m-%d")
MONTH_TAG=$(date -u +"%Y-%m")
DAY_OF_MONTH=$(date -u +"%d")

S3_BUCKET="${S3_BACKUP_BUCKET:?S3_BACKUP_BUCKET must be set}"
S3_PREFIX="${S3_BACKUP_PREFIX:-mdm/postgres}"
DB_URL="${DATABASE_URL:?DATABASE_URL must be set}"
WEBHOOK_URL="${NOTIFICATION_WEBHOOK:-}"
BACKUP_DIR="/tmp/pg-backups"
DAILY_RETENTION=30
MONTHLY_RETENTION=12

mkdir -p "${BACKUP_DIR}"

notify() {
    local status="$1" message="$2"
    echo "[${status}] ${message}"
    if [[ -n "${WEBHOOK_URL}" ]]; then
        curl -sf -X POST "${WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"[pg-backup] ${status}: ${message}\"}" || true
    fi
}

cleanup_local() {
    rm -f "${BACKUP_DIR}"/mdm_backup_*.dump
}
trap cleanup_local EXIT

# --- Perform backup ---
BACKUP_FILE="${BACKUP_DIR}/mdm_backup_${TIMESTAMP}.dump"

echo "Starting PostgreSQL backup at ${TIMESTAMP}..."
if ! pg_dump "${DB_URL}" --format=custom --compress=9 -f "${BACKUP_FILE}"; then
    notify "FAILURE" "pg_dump failed at ${TIMESTAMP}"
    exit 1
fi

BACKUP_SIZE=$(stat -f%z "${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_FILE}" 2>/dev/null)
echo "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE} bytes)"

# --- Upload daily backup ---
DAILY_KEY="s3://${S3_BUCKET}/${S3_PREFIX}/daily/mdm_backup_${DATE_TAG}.dump"
if ! aws s3 cp "${BACKUP_FILE}" "${DAILY_KEY}" --sse AES256; then
    notify "FAILURE" "S3 upload failed for daily backup ${DATE_TAG}"
    exit 1
fi
echo "Uploaded daily backup to ${DAILY_KEY}"

# --- Upload monthly backup (first day of month) ---
if [[ "${DAY_OF_MONTH}" == "01" ]]; then
    MONTHLY_KEY="s3://${S3_BUCKET}/${S3_PREFIX}/monthly/mdm_backup_${MONTH_TAG}.dump"
    if ! aws s3 cp "${BACKUP_FILE}" "${MONTHLY_KEY}" --sse AES256; then
        notify "FAILURE" "S3 upload failed for monthly backup ${MONTH_TAG}"
        exit 1
    fi
    echo "Uploaded monthly backup to ${MONTHLY_KEY}"
fi

# --- Cleanup old daily backups ---
echo "Cleaning up daily backups older than ${DAILY_RETENTION} days..."
aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/daily/" | while read -r line; do
    file_date=$(echo "${line}" | awk '{print $1}')
    file_name=$(echo "${line}" | awk '{print $4}')
    if [[ -z "${file_name}" ]]; then continue; fi
    file_epoch=$(date -d "${file_date}" +%s 2>/dev/null || date -jf "%Y-%m-%d" "${file_date}" +%s 2>/dev/null || echo 0)
    cutoff_epoch=$(date -d "-${DAILY_RETENTION} days" +%s 2>/dev/null || date -v-${DAILY_RETENTION}d +%s 2>/dev/null)
    if [[ "${file_epoch}" -lt "${cutoff_epoch}" ]]; then
        aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}/daily/${file_name}"
        echo "Deleted old daily backup: ${file_name}"
    fi
done || true

# --- Cleanup old monthly backups ---
echo "Cleaning up monthly backups beyond ${MONTHLY_RETENTION} months..."
MONTHLY_COUNT=$(aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/monthly/" | wc -l)
if [[ "${MONTHLY_COUNT}" -gt "${MONTHLY_RETENTION}" ]]; then
    EXCESS=$((MONTHLY_COUNT - MONTHLY_RETENTION))
    aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/monthly/" | head -n "${EXCESS}" | while read -r line; do
        file_name=$(echo "${line}" | awk '{print $4}')
        if [[ -n "${file_name}" ]]; then
            aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}/monthly/${file_name}"
            echo "Deleted old monthly backup: ${file_name}"
        fi
    done
fi

notify "SUCCESS" "PostgreSQL backup completed: ${DATE_TAG} (${BACKUP_SIZE} bytes)"
echo "Backup complete."
