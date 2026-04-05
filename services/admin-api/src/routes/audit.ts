import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, count, desc, gte, lte, or, ilike, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { auditLogs, users } from '../db/schema.js';
import { requirePermission } from '../middleware/rbac.js';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  actor_type: z.string().optional(),
  action: z.string().optional(),
  resource_type: z.string().optional(),
  resource: z.string().optional(),
  userId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // List audit logs with filters and pagination
  app.get('/', {
    schema: { description: 'List audit logs with filters', tags: ['audit'] },
    preHandler: [requirePermission('audit:read')],
  }, async (request, reply) => {
    const filters = querySchema.parse(request.query);
    const { page, page_size, actor_type, action, resource_type, resource, userId, from, to, search } = filters;
    const offset = (page - 1) * page_size;

    const conditions = [eq(auditLogs.orgId, request.user.orgId)];
    if (actor_type) conditions.push(eq(auditLogs.actorType, actor_type));
    if (action) conditions.push(ilike(auditLogs.action, `%${action}%`));
    if (resource_type) conditions.push(eq(auditLogs.resourceType, resource_type));
    if (resource) conditions.push(ilike(auditLogs.resource, `%${resource}%`));
    if (userId) conditions.push(eq(auditLogs.userId, userId));
    if (from) conditions.push(gte(auditLogs.createdAt, new Date(from)));
    if (to) conditions.push(lte(auditLogs.createdAt, new Date(to)));
    if (search) {
      conditions.push(
        or(
          ilike(auditLogs.action, `%${search}%`),
          ilike(auditLogs.resource, `%${search}%`),
          ilike(auditLogs.actor, `%${search}%`),
          sql`${auditLogs.details}::text ILIKE ${'%' + search + '%'}`,
        )!,
      );
    }

    const where = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      db.select({
        id: auditLogs.id,
        orgId: auditLogs.orgId,
        userId: auditLogs.userId,
        actor: auditLogs.actor,
        actorType: auditLogs.actorType,
        action: auditLogs.action,
        resource: auditLogs.resource,
        resourceId: auditLogs.resourceId,
        resourceType: auditLogs.resourceType,
        details: auditLogs.details,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
        actorEmail: users.email,
      })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(page_size)
        .offset(offset),
      db.select({ total: count() }).from(auditLogs).where(where),
    ]);

    const enriched = data.map((log) => ({
      ...log,
      actorDisplay: log.actorEmail ?? log.actor ?? 'system',
    }));

    reply.send({ data: enriched, pagination: { page, limit: page_size, total, totalPages: Math.ceil(total / page_size) } });
  });

  // Get single audit log entry with full detail
  app.get('/:id', {
    schema: { description: 'Get single audit log entry with full detail', tags: ['audit'] },
    preHandler: [requirePermission('audit:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [entry] = await db.select({
      id: auditLogs.id,
      orgId: auditLogs.orgId,
      userId: auditLogs.userId,
      actor: auditLogs.actor,
      actorType: auditLogs.actorType,
      action: auditLogs.action,
      resource: auditLogs.resource,
      resourceId: auditLogs.resourceId,
      resourceType: auditLogs.resourceType,
      details: auditLogs.details,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      createdAt: auditLogs.createdAt,
      actorEmail: users.email,
    })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(and(eq(auditLogs.id, id), eq(auditLogs.orgId, request.user.orgId)))
      .limit(1);

    if (!entry) {
      return reply.status(404).send({ error: 'Audit log entry not found' });
    }

    reply.send({ ...entry, actorDisplay: entry.actorEmail ?? entry.actor ?? 'system' });
  });

  // Export audit logs as CSV
  app.get('/export', {
    schema: { description: 'Export audit logs as CSV', tags: ['audit'] },
    preHandler: [requirePermission('audit:read')],
  }, async (request, reply) => {
    const filters = querySchema.parse(request.query);
    const { actor_type, action, resource_type, from, to, search } = filters;

    const conditions = [eq(auditLogs.orgId, request.user.orgId)];
    if (actor_type) conditions.push(eq(auditLogs.actorType, actor_type));
    if (action) conditions.push(ilike(auditLogs.action, `%${action}%`));
    if (resource_type) conditions.push(eq(auditLogs.resourceType, resource_type));
    if (from) conditions.push(gte(auditLogs.createdAt, new Date(from)));
    if (to) conditions.push(lte(auditLogs.createdAt, new Date(to)));
    if (search) {
      conditions.push(
        or(
          ilike(auditLogs.action, `%${search}%`),
          ilike(auditLogs.resource, `%${search}%`),
          ilike(auditLogs.actor, `%${search}%`),
        )!,
      );
    }

    const where = and(...conditions);

    const data = await db.select({
      id: auditLogs.id,
      actor: auditLogs.actor,
      actorType: auditLogs.actorType,
      action: auditLogs.action,
      resource: auditLogs.resource,
      resourceType: auditLogs.resourceType,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
      actorEmail: users.email,
    })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(10000);

    const csvHeader = 'Timestamp,Actor,Actor Type,Action,Resource,Resource Type,IP Address\n';
    const csvRows = data.map((row) => {
      const actor = (row.actorEmail ?? row.actor ?? 'system').replace(/"/g, '""');
      const ts = row.createdAt ? row.createdAt.toISOString() : '';
      return `"${ts}","${actor}","${row.actorType ?? ''}","${row.action}","${(row.resource ?? '').replace(/"/g, '""')}","${row.resourceType ?? ''}","${row.ipAddress ?? ''}"`;
    }).join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="audit-logs.csv"');
    reply.send(csvHeader + csvRows);
  });
}
