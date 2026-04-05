import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import { config } from '../config/index.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });
const redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
const reportQueue = new Queue('reports', { connection: redis });

const REPORT_TEMPLATES = [
  {
    id: 'device_inventory',
    name: 'Device Inventory',
    description: 'Full inventory of enrolled devices with hardware info, OS, compliance, and assigned policies',
    params: ['from', 'to'],
    filters: ['status', 'compliance_state', 'group_id'],
  },
  {
    id: 'compliance_summary',
    name: 'Compliance Summary',
    description: 'Violations by severity, by policy, with daily trend data',
    params: ['from', 'to'],
    filters: ['severity', 'policy_id'],
  },
  {
    id: 'app_usage',
    name: 'App Usage',
    description: 'Installed apps across fleet with version distribution and managed/unmanaged ratio',
    params: ['from', 'to'],
    filters: ['managed_only'],
  },
  {
    id: 'enrollment',
    name: 'Enrollment Report',
    description: 'Enrollments over time by method with success rates',
    params: ['from', 'to'],
    filters: ['method'],
  },
  {
    id: 'security_audit',
    name: 'Security Audit',
    description: 'Security events, policy violations, and admin actions from audit logs',
    params: ['from', 'to'],
    filters: ['action', 'actor'],
  },
];

const generateReportSchema = z.object({
  template_id: z.string().min(1),
  org_id: z.string().uuid(),
  format: z.enum(['csv', 'pdf', 'xlsx']).default('pdf'),
  params: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    filters: z.record(z.string()).optional(),
  }).optional(),
});

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/templates', async (_request, reply) => {
    return reply.send({ templates: REPORT_TEMPLATES });
  });

  app.post('/generate', async (request, reply) => {
    const body = generateReportSchema.parse(request.body);

    const template = REPORT_TEMPLATES.find(t => t.id === body.template_id);
    if (!template) {
      return reply.status(400).send({ error: `Unknown template: ${body.template_id}` });
    }

    const result = await pool.query(
      `INSERT INTO reports (id, template_id, org_id, format, filters, status, progress, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'queued', 0, NOW()) RETURNING *`,
      [body.template_id, body.org_id, body.format, JSON.stringify(body.params ?? {})],
    );

    const report = result.rows[0];
    await reportQueue.add('generate', {
      report_id: report.id,
      template_id: body.template_id,
      org_id: body.org_id,
      format: body.format,
      params: body.params ?? {},
    }, {
      jobId: report.id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    return reply.status(202).send({
      job_id: report.id,
      status: 'queued',
    });
  });

  app.get('/:jobId/status', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const result = await pool.query(
      `SELECT id, template_id, status, progress, error, file_url, created_at, completed_at
       FROM reports WHERE id = $1`,
      [jobId],
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Report not found' });

    const report = result.rows[0];
    return reply.send({
      job_id: report.id,
      template_id: report.template_id,
      status: report.status,
      progress_percent: report.progress ?? 0,
      download_url: report.status === 'completed' ? `/api/v1/reports/${report.id}/download` : null,
      error: report.error,
      created_at: report.created_at,
      completed_at: report.completed_at,
    });
  });

  app.get('/:jobId/download', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const result = await pool.query('SELECT * FROM reports WHERE id = $1', [jobId]);
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Report not found' });

    const report = result.rows[0];
    if (report.status !== 'completed') {
      return reply.status(409).send({ error: 'Report not yet completed', status: report.status });
    }

    if (report.file_url) {
      return reply.redirect(report.file_url);
    }

    // Fallback: return stored JSON data
    const contentTypes: Record<string, string> = {
      csv: 'text/csv',
      pdf: 'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    reply.header('Content-Type', contentTypes[report.format] ?? 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="report-${jobId}.${report.format}"`);
    return reply.send(report.result_data);
  });

  app.get('/:jobId/data', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const result = await pool.query('SELECT result_data FROM reports WHERE id = $1', [jobId]);
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Report not found' });
    return reply.send(result.rows[0].result_data);
  });
};
