#!/usr/bin/env bash
set -euo pipefail

# Vault backup script
# Takes a Raft snapshot and uploads it encrypted to S3.

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
DATE_TAG=$(date -u +"%Y-%m-%d")

S3_BUCKET="${S3_BACKUP_BUCKET:?S3_BACKUP_BUCKET must be set}"
S3_PREFIX="${S3_BACKUP_PREFIX:-mdm/vault}"
VAULT_ADDR="${VAULT_ADDR:?VAULT_ADDR must be set}"
VAULT_TOKEN="${VAULT_TOKEN:?VAULT_TOKEN must be set}"
WEBHOOK_URL="${NOTIFICATION_WEBHOOK:-}"
BACKUP_DIR="/tmp/vault-backups"

export VAULT_ADDR VAULT_TOKEN

mkdir -p "${BACKUP_DIR}"

cleanup() {
    rm -f "${BACKUP_DIR}"/vault_snapshot_*.snap
}
trap cleanup EXIT

notify() {
    local status="$1" message="$2"
    echo "[${status}] ${message}"
    if [[ -n "${WEBHOOK_URL}" ]]; then
        curl -sf -X POST "${WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"[vault-backup] ${status}: ${message}\"}" || true
    fi
}

# --- Take Raft snapshot ---
SNAPSHOT_FILE="${BACKUP_DIR}/vault_snapshot_${TIMESTAMP}.snap"
echo "Taking Vault Raft snapshot..."
if ! vault operator raft snapshot save "${SNAPSHOT_FILE}"; then
    notify "FAILURE" "Vault Raft snapshot failed at ${TIMESTAMP}"
    exit 1
fi

SNAPSHOT_SIZE=$(stat -f%z "${SNAPSHOT_FILE}" 2>/dev/null || stat -c%s "${SNAPSHOT_FILE}" 2>/dev/null)
echo "Snapshot created: ${SNAPSHOT_FILE} (${SNAPSHOT_SIZE} bytes)"

# --- Upload encrypted to S3 ---
S3_KEY="s3://${S3_BUCKET}/${S3_PREFIX}/vault_snapshot_${DATE_TAG}.snap"
echo "Uploading encrypted snapshot to ${S3_KEY}..."
if ! aws s3 cp "${SNAPSHOT_FILE}" "${S3_KEY}" --sse aws:kms; then
    notify "FAILURE" "S3 upload failed for Vault snapshot"
    exit 1
fi

notify "SUCCESS" "Vault backup completed: ${DATE_TAG} (${SNAPSHOT_SIZE} bytes)"
echo "Vault backup complete."
