import { Pool } from 'pg';
import { config } from '../config/index.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });

const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]; // 1m, 5m, 30m, 2h, 12h
const MAX_RETRIES = RETRY_DELAYS_MS.length;
const RESPONSE_BODY_LIMIT = 1024;

export interface Webhook {
  id: string;
  org_id: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  status: 'pending' | 'success' | 'failed' | 'dead_letter';
  attempt_count: number;
  status_code: number | null;
  response_body: string | null;
  duration_ms: number | null;
  payload: string;
  created_at: string;
  completed_at: string | null;
}

export async function deliverWebhook(webhook: Webhook, event: string, payload: unknown): Promise<void> {
  const body = JSON.stringify({
    event,
    data: payload,
    timestamp: new Date().toISOString(),
  });

  const deliveryId = crypto.randomUUID();

  await pool.query(
    `INSERT INTO webhook_deliveries (id, webhook_id, event, status, attempt_count, payload, created_at)
     VALUES ($1, $2, $3, 'pending', 0, $4, NOW())`,
    [deliveryId, webhook.id, event, body],
  );

  await attemptDelivery(webhook, deliveryId, body, event, 0);
}

async function attemptDelivery(webhook: Webhook, deliveryId: string, body: string, event: string, attempt: number): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-MDM-Signature': await computeSignature(body, webhook.secret),
    'X-MDM-Delivery-ID': deliveryId,
    'X-MDM-Event': event,
  };

  const start = Date.now();
  let statusCode = 0;
  let responseBody: string | null = null;

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });

    statusCode = response.status;
    const raw = await response.text();
    responseBody = raw.slice(0, RESPONSE_BODY_LIMIT);
    const durationMs = Date.now() - start;

    if (response.ok) {
      await pool.query(
        `UPDATE webhook_deliveries
         SET status = 'success', attempt_count = $1, status_code = $2, response_body = $3, duration_ms = $4, completed_at = NOW()
         WHERE id = $5`,
        [attempt + 1, statusCode, responseBody, durationMs, deliveryId],
      );
      return;
    }

    await recordFailedAttempt(deliveryId, attempt, statusCode, responseBody, durationMs);
  } catch (err) {
    const durationMs = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    await recordFailedAttempt(deliveryId, attempt, statusCode, errMsg.slice(0, RESPONSE_BODY_LIMIT), durationMs);
  }

  if (attempt < MAX_RETRIES - 1) {
    const delay = RETRY_DELAYS_MS[attempt];
    setTimeout(() => attemptDelivery(webhook, deliveryId, body, event, attempt + 1), delay);
  } else {
    await pool.query(
      `UPDATE webhook_deliveries SET status = 'dead_letter', completed_at = NOW() WHERE id = $1`,
      [deliveryId],
    );
  }
}

async function recordFailedAttempt(deliveryId: string, attempt: number, statusCode: number, responseBody: string | null, durationMs: number): Promise<void> {
  await pool.query(
    `UPDATE webhook_deliveries
     SET status = 'failed', attempt_count = $1, status_code = $2, response_body = $3, duration_ms = $4
     WHERE id = $5`,
    [attempt + 1, statusCode, responseBody, durationMs, deliveryId],
  );
}

async function computeSignature(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifySignature(body: string, secret: string, signature: string): Promise<boolean> {
  const expected = await computeSignature(body, secret);
  if (expected.length !== signature.length) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(signature);
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

export async function replayDelivery(deliveryId: string): Promise<void> {
  const result = await pool.query(
    `SELECT wd.*, w.url, w.secret FROM webhook_deliveries wd JOIN webhooks w ON w.id = wd.webhook_id WHERE wd.id = $1`,
    [deliveryId],
  );
  if (result.rows.length === 0) throw new Error('Delivery not found');

  const row = result.rows[0];
  const webhook: Webhook = { id: row.webhook_id, org_id: '', url: row.url, secret: row.secret, events: [], enabled: true };

  await pool.query(
    `UPDATE webhook_deliveries SET status = 'pending', attempt_count = 0, status_code = NULL, response_body = NULL, duration_ms = NULL, completed_at = NULL WHERE id = $1`,
    [deliveryId],
  );

  await attemptDelivery(webhook, deliveryId, row.payload, row.event, 0);
}

export async function sendTestWebhook(webhook: Webhook): Promise<WebhookDelivery> {
  const testPayload = {
    event: 'test',
    data: {
      message: 'This is a test webhook delivery from MDM Platform',
      webhook_id: webhook.id,
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  };

  const body = JSON.stringify(testPayload);
  const deliveryId = crypto.randomUUID();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-MDM-Signature': await computeSignature(body, webhook.secret),
    'X-MDM-Delivery-ID': deliveryId,
    'X-MDM-Event': 'test',
  };

  const start = Date.now();
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const durationMs = Date.now() - start;
    const responseBody = (await response.text()).slice(0, RESPONSE_BODY_LIMIT);

    const delivery: WebhookDelivery = {
      id: deliveryId,
      webhook_id: webhook.id,
      event: 'test',
      status: response.ok ? 'success' : 'failed',
      attempt_count: 1,
      status_code: response.status,
      response_body: responseBody,
      duration_ms: durationMs,
      payload: body,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    await pool.query(
      `INSERT INTO webhook_deliveries (id, webhook_id, event, status, attempt_count, status_code, response_body, duration_ms, payload, created_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
      [deliveryId, webhook.id, 'test', delivery.status, 1, delivery.status_code, responseBody, durationMs, body],
    );

    return delivery;
  } catch (err) {
    const durationMs = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    const delivery: WebhookDelivery = {
      id: deliveryId,
      webhook_id: webhook.id,
      event: 'test',
      status: 'failed',
      attempt_count: 1,
      status_code: 0,
      response_body: errMsg.slice(0, RESPONSE_BODY_LIMIT),
      duration_ms: durationMs,
      payload: body,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    await pool.query(
      `INSERT INTO webhook_deliveries (id, webhook_id, event, status, attempt_count, status_code, response_body, duration_ms, payload, created_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
      [deliveryId, webhook.id, 'test', 'failed', 1, 0, errMsg.slice(0, RESPONSE_BODY_LIMIT), durationMs, body],
    );

    return delivery;
  }
}
