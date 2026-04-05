import { FastifyPluginAsync } from 'fastify';
import { Pool } from 'pg';
import { config } from '../config/index.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });

export interface NotificationPreferences {
  email: { enabled: boolean; events: string[] };
  slack: { enabled: boolean };
  push: { enabled: boolean; events: string[] };
  in_app: { enabled: boolean };
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: { enabled: true, events: ['compliance.violated', 'cert.expiring', 'device.unenrolled'] },
  slack: { enabled: true },
  push: { enabled: true, events: ['compliance.violated', 'command.failed'] },
  in_app: { enabled: true },
};

export const notificationPreferencesRoutes: FastifyPluginAsync = async (app) => {
  // Get current user's notification preferences
  app.get('/', async (request, reply) => {
    const { user_id } = request.query as { user_id: string };
    if (!user_id) return reply.status(400).send({ error: 'user_id required' });

    const result = await pool.query(
      'SELECT preferences FROM notification_preferences WHERE user_id = $1',
      [user_id],
    );

    if (result.rows.length === 0) {
      return reply.send(DEFAULT_PREFERENCES);
    }

    return reply.send(result.rows[0].preferences);
  });

  // Update notification preferences
  app.put('/', async (request, reply) => {
    const { user_id } = request.query as { user_id: string };
    if (!user_id) return reply.status(400).send({ error: 'user_id required' });

    const preferences = request.body as NotificationPreferences;

    await pool.query(
      `INSERT INTO notification_preferences (id, user_id, preferences, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET preferences = $2, updated_at = NOW()`,
      [user_id, JSON.stringify(preferences)],
    );

    return reply.send(preferences);
  });
};
