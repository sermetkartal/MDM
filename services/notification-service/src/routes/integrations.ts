import { FastifyPluginAsync } from 'fastify';
import { Pool } from 'pg';
import { config } from '../config/index.js';
import { getSlackInstallUrl, handleSlackCallback, handleSlackAction } from '../services/slack-service.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });

export const integrationRoutes: FastifyPluginAsync = async (app) => {
  // Slack OAuth install
  app.post('/slack/install', async (request, reply) => {
    const { org_id } = request.body as { org_id: string };
    if (!org_id) return reply.status(400).send({ error: 'org_id required' });
    const url = getSlackInstallUrl(org_id);
    return reply.send({ url });
  });

  // Slack OAuth callback
  app.get('/slack/callback', async (request, reply) => {
    const { code, state } = request.query as { code: string; state: string };
    if (!code || !state) return reply.status(400).send({ error: 'Missing code or state' });

    try {
      const integration = await handleSlackCallback(code, state);
      return reply.redirect(`${config.PUBLIC_URL}/settings/integrations?slack=connected&team=${integration.team_name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OAuth failed';
      return reply.redirect(`${config.PUBLIC_URL}/settings/integrations?slack=error&message=${encodeURIComponent(message)}`);
    }
  });

  // Slack action handler (interactive messages)
  app.post('/slack/actions', async (request, reply) => {
    const payload = JSON.parse((request.body as { payload: string }).payload);
    const result = await handleSlackAction(payload);
    return reply.send(result);
  });

  // Slack channel routing config
  app.get('/slack/config', async (request, reply) => {
    const { org_id } = request.query as { org_id: string };
    if (!org_id) return reply.status(400).send({ error: 'org_id required' });

    const result = await pool.query(
      'SELECT id, org_id, team_id, team_name, channel_routing, installed_at FROM slack_integrations WHERE org_id = $1',
      [org_id],
    );
    return reply.send(result.rows[0] ?? null);
  });

  app.put('/slack/config', async (request, reply) => {
    const { org_id, channel_routing } = request.body as { org_id: string; channel_routing: Record<string, string> };
    if (!org_id) return reply.status(400).send({ error: 'org_id required' });

    await pool.query(
      'UPDATE slack_integrations SET channel_routing = $1 WHERE org_id = $2',
      [JSON.stringify(channel_routing), org_id],
    );
    return reply.send({ status: 'updated' });
  });

  // Teams webhook management
  app.get('/teams', async (request, reply) => {
    const { org_id } = request.query as { org_id: string };
    if (!org_id) return reply.status(400).send({ error: 'org_id required' });

    const result = await pool.query(
      'SELECT * FROM teams_integrations WHERE org_id = $1 ORDER BY created_at DESC',
      [org_id],
    );
    return reply.send({ integrations: result.rows });
  });

  app.post('/teams', async (request, reply) => {
    const { org_id, name, webhook_url, channel_routing } = request.body as {
      org_id: string; name: string; webhook_url: string; channel_routing?: Record<string, string>;
    };
    if (!org_id || !name || !webhook_url) {
      return reply.status(400).send({ error: 'org_id, name, and webhook_url are required' });
    }

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO teams_integrations (id, org_id, name, webhook_url, channel_routing, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id, org_id, name, webhook_url, JSON.stringify(channel_routing ?? {})],
    );
    return reply.status(201).send({ id, org_id, name, webhook_url });
  });

  app.delete('/teams/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await pool.query('DELETE FROM teams_integrations WHERE id = $1', [id]);
    return reply.status(204).send();
  });

  // Disconnect Slack
  app.delete('/slack', async (request, reply) => {
    const { org_id } = request.query as { org_id: string };
    if (!org_id) return reply.status(400).send({ error: 'org_id required' });

    await pool.query('DELETE FROM slack_integrations WHERE org_id = $1', [org_id]);
    return reply.status(204).send();
  });
};
