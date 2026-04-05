#!/usr/bin/env bash
set -euo pipefail

# Redis backup script
# Triggers BGSAVE, waits for completion, and uploads dump.rdb to S3.

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
DATE_TAG=$(date -u +"%Y-%m-%d")

S3_BUCKET="${S3_BACKUP_BUCKET:?S3_BACKUP_BUCKET must be set}"
S3_PREFIX="${S3_BACKUP_PREFIX:-mdm/redis}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_DATA_DIR="${REDIS_DATA_DIR:-/data}"
WEBHOOK_URL="${NOTIFICATION_WEBHOOK:-}"
MAX_WAIT=300

AUTH_ARGS=()
if [[ -n "${REDIS_PASSWORD}" ]]; then
    AUTH_ARGS=(-a "${REDIS_PASSWORD}")
fi

notify() {
    local status="$1" message="$2"
    echo "[${status}] ${message}"
    if [[ -n "${WEBHOOK_URL}" ]]; then
        curl -sf -X POST "${WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"[redis-backup] ${status}: ${message}\"}" || true
    fi
}

# --- Get last save timestamp ---
LAST_SAVE=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" "${AUTH_ARGS[@]}" LASTSAVE 2>/dev/null)

# --- Trigger BGSAVE ---
echo "Triggering Redis BGSAVE..."
redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" "${AUTH_ARGS[@]}" BGSAVE

# --- Wait for BGSAVE to complete ---
echo "Waiting for BGSAVE to complete..."
WAITED=0
while true; do
    CURRENT_SAVE=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" "${AUTH_ARGS[@]}" LASTSAVE 2>/dev/null)
    if [[ "${CURRENT_SAVE}" != "${LAST_SAVE}" ]]; then
        echo "BGSAVE completed."
        break
    fi
    if [[ "${WAITED}" -ge "${MAX_WAIT}" ]]; then
        notify "FAILURE" "BGSAVE did not complete within ${MAX_WAIT}s"
        exit 1
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done

# --- Upload dump.rdb to S3 ---
DUMP_FILE="${REDIS_DATA_DIR}/dump.rdb"
if [[ ! -f "${DUMP_FILE}" ]]; then
    notify "FAILURE" "dump.rdb not found at ${DUMP_FILE}"
    exit 1
fi

S3_KEY="s3://${S3_BUCKET}/${S3_PREFIX}/dump_${DATE_TAG}.rdb"
echo "Uploading ${DUMP_FILE} to ${S3_KEY}..."
if ! aws s3 cp "${DUMP_FILE}" "${S3_KEY}" --sse AES256; then
    notify "FAILURE" "S3 upload failed for Redis backup"
    exit 1
fi

BACKUP_SIZE=$(stat -f%z "${DUMP_FILE}" 2>/dev/null || stat -c%s "${DUMP_FILE}" 2>/dev/null)
notify "SUCCESS" "Redis backup completed: ${DATE_TAG} (${BACKUP_SIZE} bytes)"
echo "Redis backup complete."
