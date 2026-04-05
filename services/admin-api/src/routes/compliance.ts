import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, count, desc, isNull, sql, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { complianceRules, complianceViolations, devices, auditLogs } from '../db/schema.js';
import { requirePermission } from '../middleware/rbac.js';

const createRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  condition: z.record(z.unknown()),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  action: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
});

const updateRuleSchema = createRuleSchema.partial();

export async function complianceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // --- Rules CRUD ---
  app.get('/rules', {
    schema: { description: 'List compliance rules', tags: ['compliance'] },
    preHandler: [requirePermission('compliance:read')],
  }, async (request, reply) => {
    const { page = 1, limit = 25 } = request.query as { page?: number; limit?: number };
    const offset = (Number(page) - 1) * Number(limit);
    const where = eq(complianceRules.orgId, request.user.orgId);

    const [data, [{ total }]] = await Promise.all([
      db.select().from(complianceRules).where(where).orderBy(desc(complianceRules.createdAt)).limit(Number(limit)).offset(offset),
      db.select({ total: count() }).from(complianceRules).where(where),
    ]);

    reply.send({ data, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
  });

  app.post('/rules', {
    schema: { description: 'Create a compliance rule', tags: ['compliance'] },
    preHandler: [requirePermission('compliance:write')],
  }, async (request, reply) => {
    const body = createRuleSchema.parse(request.body);
    const [rule] = await db.insert(complianceRules).values({ ...body, orgId: request.user.orgId }).returning();

    await db.insert(auditLogs).values({ orgId: request.user.orgId, userId: request.user.sub, action: 'compliance_rule.created', resource: 'compliance_rule', resourceId: rule.id });
    reply.status(201).send(rule);
  });

  app.get('/rules/:id', {
    schema: { description: 'Get compliance rule by ID', tags: ['compliance'] },
    preHandler: [requirePermission('compliance:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [rule] = await db.select().from(complianceRules).where(and(eq(complianceRules.id, id), eq(complianceRules.orgId, request.user.orgId))).limit(1);
    if (!rule) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Compliance rule not found' }); return; }
    reply.send(rule);
  });

  app.patch('/rules/:id', {
    schema: { description: 'Update a compliance rule', tags: ['compliance'] },
    preHandler: [requirePermission('compliance:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateRuleSchema.parse(request.body);
    const [updated] = await db.update(complianceRules).set({ ...body, updatedAt: new Date() }).where(and(eq(complianceRules.id, id), eq(complianceRules.orgId, request.user.orgId))).returning();
    if (!updated) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Compliance rule not found' }); return; }
    reply.send(updated);
  });

  app.delete('/rules/:id', {
    schema: { description: 'Delete a compliance rule', tags: ['compliance'] },
    preHandler: [requirePermission('compliance:delete')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(complianceRules).where(and(eq(complianceRules.id, id), eq(complianceRules.orgId, request.user.orgId)));
    reply.status(204).send();
  });

  // --- Status & Summary ---
  app.get('/status', {
    schema: { description: 'Get org-wide compliance summary with per-severity counts', tags: ['compliance'] },
    preHandler: [requirePermission('compliance:read')],
  }, async (request, reply) => {
    const orgId = request.user.orgId;

    // Device compliance counts
    const [compliant, nonCompliant, unknown, pending] = await Promise.all([
      db.select({ total: count() }).from(devices).where(and(eq(devices.orgId, orgId), eq(devices.complianceStatus, 'compliant'))),
      db.select({ total: count() }).from(devices).where(and(eq(devices.orgId, orgId), eq(devices.complianceStatus, 'non_compliant'))),
      db.select({ total: count() }).from(devices).where(and(eq(devices.orgId, orgId), eq(devices.complianceStatus, 'unknown'))),
      db.select({ total: count() }).from(devices).where(and(eq(devices.orgId, orgId), eq(devices.status, 'enrolled'))),
    ]);

    const totalEnrolled = pending[0].total;
    const compliantCount = compliant[0].total;
    const scorePercent = totalEnrolled > 0 ? (compliantCount / totalEnrolled) * 100 : 0;

    // Per-severity active violation counts
    const severityCounts = await db
      .select({
        severity: complianceRules.severity,
        count: count(),
      })
      .from(complianceViolations)
      .innerJoin(complianceRules, eq(complianceViolations.ruleId, complianceRules.id))
      .where(and(eq(complianceViolations.orgId, orgId), isNull(complianceViolations.resolvedAt)))
      .groupBy(complianceRules.severity);

    const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const row of severityCounts) {
      bySeverity[row.severity] = row.count;
    }

    reply.send({
      compliant: compliantCount,
      nonCompliant: nonCompliant[0].total,
      unknown: unknown[0].total,
      totalEnrolled,
      scorePercent: Math.round(scorePercent * 100) / 100,
      bySeverity,
    });
  });

  // --- Violations ---
  app.get('/violations', {
    schema: { description: 'List compliance violations with filters', tags: ['compliance'] },
    preHandler: [requirePermission('compliance:read')],
  }, async (request, reply) => {
    const { page = 1, limit = 25, resolved, severity, status, device_id } = request.query as {
      page?: number; limit?: number; resolved?: string; severity?: string; status?: string; device_id?: string;
    };
    const offset = (Number(page) - 1) * Number(limit);

    const conditions = [eq(complianceViolations.orgId, request.user.orgId)];
    if (resolved === 'false') conditions.push(isNull(complianceViolations.resolvedAt));
    if (device_id) conditions.push(eq(complianceViolations.deviceId, device_id));

    // Join with rules to get severity and rule name
    const where = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      db.select({
        id: complianceViolations.id,
        deviceId: complianceViolations.deviceId,
        ruleId: complianceViolations.ruleId,
        ruleName: complianceRules.name,
        severity: complianceRules.severity,
        details: complianceViolations.details,
        resolvedAt: complianceViolations.resolvedAt,
        createdAt: complianceViolations.createdAt,
      })
        .from(complianceViolations)
        .innerJoin(complianceRules, eq(complianceViolations.ruleId, complianceRules.id))
        .where(severity
          ? and(where, eq(complianceRules.severity, severity))
          : where)
        .orderBy(desc(complianceViolations.createdAt))
        .limit(Number(limit))
        .offset(offset),
      db.select({ total: count() })
        .from(complianceViolations)
        .innerJoin(complianceRules, eq(complianceViolations.ruleId, complianceRules.id))
        .where(severity
          ? and(where, eq(complianceRules.severity, severity))
          : where),
    ]);

    reply.send({ data, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
  });

  // --- Trend ---
  app.get('/trend', {
    schema: { description: 'Get daily compliance score for trend chart', tags: ['compliance'] },
    preHandler: [requirePermission('compliance:read')],
  }, async (request, reply) => {
    const { days = 30 } = request.query as { days?: number };
    const orgId = request.user.orgId;
    const daysNum = Number(days);

    // Get daily violation counts for trend
    const trend = await db.execute(sql`
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - ${daysNum} * INTERVAL '1 day',
          CURRENT_DATE,
          INTERVAL '1 day'
        )::date AS day
      ),
      daily_violations AS (
        SELECT
          date_trunc('day', created_at)::date AS day,
          COUNT(*) AS new_violations,
          COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved
        FROM compliance_violations
        WHERE org_id = ${orgId}
        AND created_at >= CURRENT_DATE - ${daysNum} * INTERVAL '1 day'
        GROUP BY date_trunc('day', created_at)::date
      ),
      enrolled_count AS (
        SELECT COUNT(*) AS total
        FROM devices
        WHERE org_id = ${orgId} AND status = 'enrolled'
      ),
      daily_active AS (
        SELECT
          ds.day,
          COALESCE(dv.new_violations, 0) AS new_violations,
          COALESCE(dv.resolved, 0) AS resolved,
          (SELECT COUNT(DISTINCT device_id) FROM compliance_violations
           WHERE org_id = ${orgId} AND resolved_at IS NULL
           AND created_at <= ds.day + INTERVAL '1 day') AS devices_with_violations
        FROM date_series ds
        LEFT JOIN daily_violations dv ON ds.day = dv.day
      )
      SELECT
        da.day,
        da.new_violations,
        da.resolved,
        da.devices_with_violations,
        ec.total AS total_enrolled,
        CASE
          WHEN ec.total > 0 THEN ROUND(((ec.total - da.devices_with_violations)::numeric / ec.total::numeric) * 100, 2)
          ELSE 100
        END AS score
      FROM daily_active da
      CROSS JOIN enrolled_count ec
      ORDER BY da.day ASC
    `);

    reply.send({ data: trend.rows });
  });
}
