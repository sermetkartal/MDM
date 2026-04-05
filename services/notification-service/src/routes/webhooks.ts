import { FastifyPluginAsync } from 'fastify';
import { Pool } from 'pg';
import { config } from '../config/index.js';
import { replayDelivery, sendTestWebhook, type Webhook } from '../services/webhook-service.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  // List webhooks for an org
  app.get('/', async (request, reply) => {
    const { org_id } = request.query as { org_id: string };
    if (!org_id) return reply.status(400).send({ error: 'org_id required' });

    const result = await pool.query(
      'SELECT id, org_id, url, events, enabled, created_at FROM webhooks WHERE org_id = $1 ORDER BY created_at DESC',
      [org_id],
    );
    return reply.send({ webhooks: result.rows });
  });

  // Create a webhook
  app.post('/', async (request, reply) => {
    const { org_id, url, events } = request.body as { org_id: string; url: string; events: string[] };
    if (!org_id || !url || !events?.length) {
      return reply.status(400).send({ error: 'org_id, url, and events are required' });
    }

    const id = crypto.randomUUID();
    const secret = `whsec_${crypto.randomUUID().replace(/-/g, '')}`;

    await pool.query(
      `INSERT INTO webhooks (id, org_id, url, secret, events, enabled, created_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW())`,
      [id, org_id, url, secret, JSON.stringify(events)],
    );

    return reply.status(201).send({ id, url, secret, events, enabled: true });
  });

  // Get webhook details
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await pool.query('SELECT * FROM webhooks WHERE id = $1', [id]);
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Webhook not found' });

    const webhook = result.rows[0];
    // Don't expose the full secret
    webhook.secret_preview = webhook.secret ? `${webhook.secret.slice(0, 10)}...` : null;
    delete webhook.secret;
    return reply.send(webhook);
  });

  // Update webhook
  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { url, events, enabled } = request.body as { url?: string; events?: string[]; enabled?: boolean };

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (url !== undefined) { sets.push(`url = $${idx++}`); params.push(url); }
    if (events !== undefined) { sets.push(`events = $${idx++}`); params.push(JSON.stringify(events)); }
    if (enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(enabled); }

    if (sets.length === 0) return reply.status(400).send({ error: 'No fields to update' });

    params.push(id);
    const result = await pool.query(
      `UPDATE webhooks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, org_id, url, events, enabled`,
      params,
    );

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Webhook not found' });
    return reply.send(result.rows[0]);
  });

  // Delete webhook
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await pool.query('DELETE FROM webhooks WHERE id = $1', [id]);
    return reply.status(204).send();
  });

  // Get deliveries for a webhook
  app.get('/:id/deliveries', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit = '20', offset = '0' } = request.query as { limit?: string; offset?: string };

    const result = await pool.query(
      `SELECT id, webhook_id, event, status, attempt_count, status_code, response_body, duration_ms, created_at, completed_at
       FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [id, parseInt(limit, 10), parseInt(offset, 10)],
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM webhook_deliveries WHERE webhook_id = $1',
      [id],
    );

    return reply.send({
      deliveries: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
    });
  });

  // Replay a specific delivery
  app.post('/:id/deliveries/:did/replay', async (request, reply) => {
    const { did } = request.params as { id: string; did: string };
    try {
      await replayDelivery(did);
      return reply.send({ status: 'replaying' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Replay failed';
      return reply.status(400).send({ error: message });
    }
  });

  // Send test event
  app.post('/:id/test', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await pool.query('SELECT * FROM webhooks WHERE id = $1', [id]);
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Webhook not found' });

    const webhook = result.rows[0] as Webhook;
    webhook.events = typeof webhook.events === 'string' ? JSON.parse(webhook.events) : webhook.events;

    const delivery = await sendTestWebhook(webhook);
    return reply.send(delivery);
  });
};
