import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, count, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps, appVersions, appAssignments, auditLogs } from '../db/schema.js';
import { requirePermission } from '../middleware/rbac.js';

const createAppSchema = z.object({
  name: z.string().min(1).max(255),
  bundleId: z.string().min(1).max(255),
  platform: z.enum(['ios', 'android', 'windows', 'macos', 'linux']),
  type: z.enum(['public', 'enterprise', 'web_clip']).default('enterprise'),
  iconUrl: z.string().url().optional(),
  description: z.string().optional(),
});

const updateAppSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  iconUrl: z.string().url().optional(),
  description: z.string().optional(),
});

const versionSchema = z.object({
  version: z.string().min(1),
  versionCode: z.number().int().positive().optional(),
  downloadUrl: z.string().url().optional(),
  fileHash: z.string().optional(),
  fileSize: z.number().int().positive().optional(),
  minSdkVersion: z.number().int().optional(),
  releaseNotes: z.string().optional(),
});

const assignmentSchema = z.object({
  deviceId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  installType: z.enum(['required', 'optional', 'prohibited']).default('optional'),
});

export async function appRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // List apps
  app.get('/', {
    schema: { description: 'List apps', tags: ['apps'] },
    preHandler: [requirePermission('apps:read')],
  }, async (request, reply) => {
    const { page = 1, limit = 25 } = request.query as { page?: number; limit?: number };
    const offset = (Number(page) - 1) * Number(limit);
    const where = eq(apps.orgId, request.user.orgId);

    const [data, [{ total }]] = await Promise.all([
      db.select().from(apps).where(where).orderBy(desc(apps.createdAt)).limit(Number(limit)).offset(offset),
      db.select({ total: count() }).from(apps).where(where),
    ]);

    reply.send({ data, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
  });

  // Create app
  app.post('/', {
    schema: { description: 'Create an app', tags: ['apps'] },
    preHandler: [requirePermission('apps:write')],
  }, async (request, reply) => {
    const body = createAppSchema.parse(request.body);
    const [created] = await db.insert(apps).values({ ...body, orgId: request.user.orgId }).returning();

    await db.insert(auditLogs).values({ orgId: request.user.orgId, userId: request.user.sub, action: 'app.created', resource: 'app', resourceId: created.id });
    reply.status(201).send(created);
  });

  // Get app by ID
  app.get('/:id', {
    schema: { description: 'Get app by ID', tags: ['apps'] },
    preHandler: [requirePermission('apps:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [record] = await db.select().from(apps).where(and(eq(apps.id, id), eq(apps.orgId, request.user.orgId))).limit(1);
    if (!record) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'App not found' }); return; }
    reply.send(record);
  });

  // Update app
  app.patch('/:id', {
    schema: { description: 'Update an app', tags: ['apps'] },
    preHandler: [requirePermission('apps:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateAppSchema.parse(request.body);
    const [updated] = await db.update(apps).set({ ...body, updatedAt: new Date() }).where(and(eq(apps.id, id), eq(apps.orgId, request.user.orgId))).returning();
    if (!updated) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'App not found' }); return; }
    reply.send(updated);
  });

  // Delete app
  app.delete('/:id', {
    schema: { description: 'Delete an app', tags: ['apps'] },
    preHandler: [requirePermission('apps:delete')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(apps).where(and(eq(apps.id, id), eq(apps.orgId, request.user.orgId)));
    await db.insert(auditLogs).values({ orgId: request.user.orgId, userId: request.user.sub, action: 'app.deleted', resource: 'app', resourceId: id });
    reply.status(204).send();
  });

  // Add app version
  app.post('/:id/versions', {
    schema: { description: 'Add an app version', tags: ['apps'] },
    preHandler: [requirePermission('apps:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = versionSchema.parse(request.body);

    const [record] = await db.select().from(apps).where(and(eq(apps.id, id), eq(apps.orgId, request.user.orgId))).limit(1);
    if (!record) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'App not found' }); return; }

    // Mark existing versions as not current
    await db.update(appVersions).set({ isCurrent: false }).where(eq(appVersions.appId, id));

    const [version] = await db.insert(appVersions).values({
      appId: id,
      ...body,
      isCurrent: true,
    }).returning();
    reply.status(201).send(version);
  });

  // List app versions
  app.get('/:id/versions', {
    schema: { description: 'List app versions', tags: ['apps'] },
    preHandler: [requirePermission('apps:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [record] = await db.select().from(apps).where(and(eq(apps.id, id), eq(apps.orgId, request.user.orgId))).limit(1);
    if (!record) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'App not found' }); return; }

    const versions = await db.select().from(appVersions).where(eq(appVersions.appId, id)).orderBy(desc(appVersions.createdAt));
    reply.send({ data: versions });
  });

  // Rollback to specific version
  app.post('/:id/versions/:vid/rollback', {
    schema: { description: 'Rollback to specific app version', tags: ['apps'] },
    preHandler: [requirePermission('apps:write')],
  }, async (request, reply) => {
    const { id, vid } = request.params as { id: string; vid: string };

    const [record] = await db.select().from(apps).where(and(eq(apps.id, id), eq(apps.orgId, request.user.orgId))).limit(1);
    if (!record) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'App not found' }); return; }

    const [version] = await db.select().from(appVersions).where(and(eq(appVersions.id, vid), eq(appVersions.appId, id))).limit(1);
    if (!version) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Version not found' }); return; }

    await db.update(appVersions).set({ isCurrent: false }).where(eq(appVersions.appId, id));
    const [updated] = await db.update(appVersions).set({ isCurrent: true }).where(and(eq(appVersions.id, vid), eq(appVersions.appId, id))).returning();

    await db.insert(auditLogs).values({ orgId: request.user.orgId, userId: request.user.sub, action: 'app.version.rollback', resource: 'app_version', resourceId: vid });
    reply.send(updated);
  });

  // Assign app to device/group with install type
  app.post('/:id/assignments', {
    schema: { description: 'Assign an app to a device or group', tags: ['apps'] },
    preHandler: [requirePermission('apps:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = assignmentSchema.parse(request.body);

    if (!body.deviceId && !body.groupId) {
      reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Either deviceId or groupId is required' });
      return;
    }

    const [assignment] = await db.insert(appAssignments).values({
      appId: id,
      ...body,
    }).returning();

    await db.insert(auditLogs).values({ orgId: request.user.orgId, userId: request.user.sub, action: 'app.assigned', resource: 'app_assignment', resourceId: assignment.id });
    reply.status(201).send(assignment);
  });

  // List assignments for an app
  app.get('/:id/assignments', {
    schema: { description: 'List app assignments', tags: ['apps'] },
    preHandler: [requirePermission('apps:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const assignments = await db.select().from(appAssignments).where(eq(appAssignments.appId, id));
    reply.send({ data: assignments });
  });

  // Remove assignment
  app.delete('/:id/assignments/:aid', {
    schema: { description: 'Remove app assignment', tags: ['apps'] },
    preHandler: [requirePermission('apps:write')],
  }, async (request, reply) => {
    const { id, aid } = request.params as { id: string; aid: string };
    await db.delete(appAssignments).where(and(eq(appAssignments.id, aid), eq(appAssignments.appId, id)));
    reply.status(204).send();
  });
}
