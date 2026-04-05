import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Pool } from 'pg';
import { config } from '../config/index.js';
import { getScheduler } from '../services/scheduler.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });

const createScheduleSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  template_id: z.string().min(1),
  params: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    filters: z.record(z.string()).optional(),
  }).optional(),
  format: z.enum(['csv', 'pdf', 'xlsx']).default('pdf'),
  cron_expression: z.string().min(1),
  recipients: z.array(z.string().email()).min(1),
  is_active: z.boolean().default(true),
});

const updateScheduleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  template_id: z.string().min(1).optional(),
  params: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    filters: z.record(z.string()).optional(),
  }).optional(),
  format: z.enum(['csv', 'pdf', 'xlsx']).optional(),
  cron_expression: z.string().min(1).optional(),
  recipients: z.array(z.string().email()).min(1).optional(),
  is_active: z.boolean().optional(),
});

function cronToHuman(cron: string): string {
  const presets: Record<string, string> = {
    '0 8 * * *': 'Daily at 8:00 AM',
    '0 8 * * 1': 'Weekly on Monday at 8:00 AM',
    '0 8 1 * *': 'Monthly on the 1st at 8:00 AM',
  };
  return presets[cron] ?? cron;
}

export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    const { org_id } = request.query as { org_id?: string };
    const whereClause = org_id ? 'WHERE org_id = $1' : '';
    const params = org_id ? [org_id] : [];

    const result = await pool.query(
      `SELECT * FROM report_schedules ${whereClause} ORDER BY created_at DESC`,
      params,
    );

    const schedules = result.rows.map(row => ({
      ...row,
      cron_human: cronToHuman(row.cron_expression),
    }));

    return reply.send({ schedules });
  });

  app.post('/', async (request, reply) => {
    const body = createScheduleSchema.parse(request.body);

    const result = await pool.query(
      `INSERT INTO report_schedules
        (id, org_id, name, template_id, params, format, cron_expression, recipients, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        body.org_id,
        body.name,
        body.template_id,
        JSON.stringify(body.params ?? {}),
        body.format,
        body.cron_expression,
        JSON.stringify(body.recipients),
        body.is_active,
      ],
    );

    const schedule = result.rows[0];

    // Register with scheduler
    if (schedule.is_active) {
      const scheduler = getScheduler();
      await scheduler.registerSchedule(schedule);
    }

    return reply.status(201).send(schedule);
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateScheduleSchema.parse(request.body);

    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (body.name !== undefined) { values.push(body.name); sets.push(`name = $${++paramIdx}`); }
    if (body.template_id !== undefined) { values.push(body.template_id); sets.push(`template_id = $${++paramIdx}`); }
    if (body.params !== undefined) { values.push(JSON.stringify(body.params)); sets.push(`params = $${++paramIdx}`); }
    if (body.format !== undefined) { values.push(body.format); sets.push(`format = $${++paramIdx}`); }
    if (body.cron_expression !== undefined) { values.push(body.cron_expression); sets.push(`cron_expression = $${++paramIdx}`); }
    if (body.recipients !== undefined) { values.push(JSON.stringify(body.recipients)); sets.push(`recipients = $${++paramIdx}`); }
    if (body.is_active !== undefined) { values.push(body.is_active); sets.push(`is_active = $${++paramIdx}`); }

    const result = await pool.query(
      `UPDATE report_schedules SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...values],
    );

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Schedule not found' });

    const schedule = result.rows[0];
    const scheduler = getScheduler();
    await scheduler.updateSchedule(schedule);

    return reply.send(schedule);
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await pool.query('DELETE FROM report_schedules WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Schedule not found' });

    const scheduler = getScheduler();
    await scheduler.removeSchedule(id);

    return reply.status(204).send();
  });

  app.post('/:id/run-now', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await pool.query('SELECT * FROM report_schedules WHERE id = $1', [id]);
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Schedule not found' });

    const schedule = result.rows[0];
    const scheduler = getScheduler();
    const jobId = await scheduler.triggerNow(schedule);

    return reply.status(202).send({ job_id: jobId, status: 'queued' });
  });
};
