import { config } from '../config/index.js';

export interface SIEMConfig {
  type: 'splunk_hec' | 'syslog' | 'qradar';
  endpoint: string;
  token: string;
  enabled: boolean;
  tlsEnabled?: boolean;
}

interface AuditEvent {
  action: string;
  actor: string;
  actor_type: string;
  resource_type: string;
  resource_id: string;
  detail: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

const BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 10000;

let siemConfig: SIEMConfig | null = null;
let eventBuffer: AuditEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function setSIEMConfig(cfg: SIEMConfig | null): void {
  siemConfig = cfg;
  if (cfg?.enabled && !flushTimer) {
    scheduleFlush();
  }
}

export function getSIEMConfig(): SIEMConfig | null {
  return siemConfig;
}

export function forwardEvent(event: AuditEvent): void {
  if (!siemConfig?.enabled) return;

  eventBuffer.push(event);

  if (eventBuffer.length >= BATCH_SIZE) {
    flushEvents();
  }
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushEvents();
    if (siemConfig?.enabled) scheduleFlush();
  }, FLUSH_INTERVAL_MS);
}

async function flushEvents(): Promise<void> {
  if (eventBuffer.length === 0 || !siemConfig?.enabled) return;

  const batch = eventBuffer.splice(0, eventBuffer.length);

  try {
    switch (siemConfig.type) {
      case 'splunk_hec':
        await forwardToSplunkHEC(batch);
        break;
      case 'syslog':
        await forwardViaSyslog(batch);
        break;
      case 'qradar':
        await forwardToSplunkHEC(batch); // QRadar supports HEC-compatible endpoint
        break;
    }
  } catch (err) {
    console.error('Failed to forward events to SIEM:', err);
    // Re-add failed events
    eventBuffer.unshift(...batch);
  }
}

async function forwardToSplunkHEC(events: AuditEvent[]): Promise<void> {
  if (!siemConfig) return;

  const payload = events.map((event) => JSON.stringify({
    time: new Date(event.created_at).getTime() / 1000,
    sourcetype: 'mdm:audit',
    source: 'mdm-audit-service',
    event: {
      action: event.action,
      actor: event.actor,
      actor_type: event.actor_type,
      resource_type: event.resource_type,
      resource_id: event.resource_id,
      ip_address: event.ip_address,
      detail: event.detail,
    },
  })).join('\n');

  const response = await fetch(siemConfig.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Splunk ${siemConfig.token}`,
      'Content-Type': 'application/json',
    },
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`Splunk HEC responded with ${response.status}: ${await response.text()}`);
  }
}

async function forwardViaSyslog(events: AuditEvent[]): Promise<void> {
  // RFC 5424 syslog format over HTTP (for environments that expose an HTTP syslog receiver)
  if (!siemConfig) return;

  for (const event of events) {
    const facility = 13; // log audit
    const severity = 6; // informational
    const pri = facility * 8 + severity;
    const timestamp = new Date(event.created_at).toISOString();
    const hostname = 'mdm-audit-service';
    const appName = 'mdm';
    const msgId = event.action;

    const structuredData = `[mdm@0 action="${event.action}" actor="${event.actor}" actor_type="${event.actor_type}" resource_type="${event.resource_type}" resource_id="${event.resource_id}"]`;
    const message = `<${pri}>1 ${timestamp} ${hostname} ${appName} - ${msgId} ${structuredData} ${JSON.stringify(event.detail)}`;

    await fetch(siemConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        ...(siemConfig.token ? { 'Authorization': `Bearer ${siemConfig.token}` } : {}),
      },
      body: message,
    });
  }
}

export async function sendTestEvent(): Promise<{ success: boolean; error?: string }> {
  if (!siemConfig?.enabled) {
    return { success: false, error: 'SIEM integration is not enabled' };
  }

  const testEvent: AuditEvent = {
    action: 'siem.test',
    actor: 'system',
    actor_type: 'system',
    resource_type: 'siem',
    resource_id: 'test',
    detail: { message: 'SIEM integration test event from MDM audit service' },
    ip_address: '127.0.0.1',
    created_at: new Date().toISOString(),
  };

  try {
    eventBuffer.push(testEvent);
    await flushEvents();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
