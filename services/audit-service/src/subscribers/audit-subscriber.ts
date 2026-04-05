import { connect, StringCodec, type NatsConnection } from 'nats';
import { config } from '../config/index.js';
import { batchWriteAuditEntries, type AuditWriteEntry } from '../services/audit-service.js';

const sc = StringCodec();

const BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 5000;

let nc: NatsConnection;
let buffer: AuditWriteEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function mapSubjectToResourceType(subject: string): string {
  const parts = subject.split('.');
  if (parts.length >= 2) return parts[1];
  return 'unknown';
}

function determineActorType(event: Record<string, unknown>): string {
  if (event.actor_type) return String(event.actor_type);
  if (event.user_id) return 'user';
  if (event.device_id) return 'device';
  return 'system';
}

async function flushBuffer(logger: { info: (msg: string) => void; error: (msg: string) => void }): Promise<void> {
  if (buffer.length === 0) return;

  const batch = buffer.splice(0, buffer.length);
  try {
    await batchWriteAuditEntries(batch);
    logger.info(`Flushed ${batch.length} audit entries`);
  } catch (err) {
    logger.error(`Failed to batch write audit entries: ${err}`);
    // Re-add failed entries to the front of the buffer for retry
    buffer.unshift(...batch);
  }
}

function scheduleFlush(logger: { info: (msg: string) => void; error: (msg: string) => void }): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flushBuffer(logger), FLUSH_INTERVAL_MS);
}

export async function startAuditSubscriber(logger: { info: (msg: string) => void; error: (msg: string) => void }): Promise<void> {
  nc = await connect({ servers: config.NATS_URL });
  logger.info(`Connected to NATS at ${config.NATS_URL}`);

  // Subscribe to all MDM events for audit logging
  const sub = nc.subscribe('mdm.>');

  scheduleFlush(logger);

  (async () => {
    for await (const msg of sub) {
      try {
        const event = JSON.parse(sc.decode(msg.data));

        const entry: AuditWriteEntry = {
          org_id: event.org_id,
          actor: event.actor ?? event.user_email ?? 'system',
          actor_type: determineActorType(event),
          action: event.action ?? msg.subject,
          resource_type: event.resource_type ?? mapSubjectToResourceType(msg.subject),
          resource_id: event.resource_id ?? '',
          detail: event,
          ip_address: event.ip_address,
        };

        buffer.push(entry);

        if (buffer.length >= BATCH_SIZE) {
          await flushBuffer(logger);
          scheduleFlush(logger);
        }
      } catch (err) {
        logger.error(`Failed to process audit event: ${err}`);
      }
    }
  })();
}
