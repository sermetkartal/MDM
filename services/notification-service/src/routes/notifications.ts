import { FastifyPluginAsync } from 'fastify';
import { Pool } from 'pg';
import { config } from '../config/index.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  // List notifications
  app.get('/', async (request, reply) => {
    const { org_id, user_id, limit = '20', offset = '0', unread_only } = request.query as Record<string, string>;
    if (!org_id) return reply.status(400).send({ error: 'org_id query parameter required' });

    let query = 'SELECT * FROM notifications WHERE org_id = $1';
    const params: unknown[] = [org_id];
    let idx = 2;

    if (user_id) {
      query += ` AND (user_id = $${idx} OR user_id IS NULL)`;
      params.push(user_id);
      idx++;
    }

    if (unread_only === 'true') {
      query += ' AND read_at IS NULL';
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await pool.query(query, params);

    const countQuery = `SELECT COUNT(*) as total FROM notifications WHERE org_id = $1${user_id ? ' AND (user_id = $2 OR user_id IS NULL)' : ''}`;
    const countParams = user_id ? [org_id, user_id] : [org_id];
    const countResult = await pool.query(countQuery, countParams);

    return reply.send({
      notifications: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
    });
  });

  // Get unread count
  app.get('/unread-count', async (request, reply) => {
    const { org_id, user_id } = request.query as { org_id: string; user_id?: string };
    if (!org_id) return reply.status(400).send({ error: 'org_id required' });

    let query = 'SELECT COUNT(*) as count FROM notifications WHERE org_id = $1 AND read_at IS NULL';
    const params: unknown[] = [org_id];

    if (user_id) {
      query += ' AND (user_id = $2 OR user_id IS NULL)';
      params.push(user_id);
    }

    const result = await pool.query(query, params);
    return reply.send({ count: parseInt(result.rows[0].count, 10) });
  });

  // Mark single notification as read
  app.patch('/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await pool.query(
      'UPDATE notifications SET read_at = NOW() WHERE id = $1 RETURNING *',
      [id],
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Notification not found' });
    return reply.send(result.rows[0]);
  });

  // Mark all notifications as read
  app.post('/mark-all-read', async (request, reply) => {
    const { org_id, user_id } = request.body as { org_id: string; user_id?: string };
    if (!org_id) return reply.status(400).send({ error: 'org_id required' });

    let query = 'UPDATE notifications SET read_at = NOW() WHERE org_id = $1 AND read_at IS NULL';
    const params: unknown[] = [org_id];

    if (user_id) {
      query += ' AND (user_id = $2 OR user_id IS NULL)';
      params.push(user_id);
    }

    const result = await pool.query(query, params);
    return reply.send({ updated: result.rowCount });
  });
};
