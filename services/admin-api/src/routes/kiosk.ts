import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, count, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { kioskProfiles, auditLogs } from '../db/schema.js';
import { requirePermission } from '../middleware/rbac.js';

const createKioskSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  allowedApps: z.array(z.string()).default([]),
  wallpaperUrl: z.string().url().optional(),
  autoLaunchApp: z.string().optional(),
  exitPassword: z.string().optional(),
  settings: z.record(z.unknown()).optional().default({}),
});

const updateKioskSchema = createKioskSchema.partial();

export async function kioskRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/', {
    schema: { description: 'List kiosk profiles', tags: ['kiosk'] },
    preHandler: [requirePermission('kiosk:read')],
  }, async (request, reply) => {
    const { page = 1, limit = 25 } = request.query as { page?: number; limit?: number };
    const offset = (Number(page) - 1) * Number(limit);
    const where = eq(kioskProfiles.orgId, request.user.orgId);

    const [data, [{ total }]] = await Promise.all([
      db.select().from(kioskProfiles).where(where).orderBy(desc(kioskProfiles.createdAt)).limit(Number(limit)).offset(offset),
      db.select({ total: count() }).from(kioskProfiles).where(where),
    ]);

    reply.send({ data, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
  });

  app.post('/', {
    schema: { description: 'Create a kiosk profile', tags: ['kiosk'] },
    preHandler: [requirePermission('kiosk:write')],
  }, async (request, reply) => {
    const body = createKioskSchema.parse(request.body);
    const [profile] = await db.insert(kioskProfiles).values({ ...body, orgId: request.user.orgId }).returning();

    await db.insert(auditLogs).values({ orgId: request.user.orgId, userId: request.user.sub, action: 'kiosk.created', resource: 'kiosk_profile', resourceId: profile.id });
    reply.status(201).send(profile);
  });

  app.get('/:id', {
    schema: { description: 'Get kiosk profile by ID', tags: ['kiosk'] },
    preHandler: [requirePermission('kiosk:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [profile] = await db.select().from(kioskProfiles).where(and(eq(kioskProfiles.id, id), eq(kioskProfiles.orgId, request.user.orgId))).limit(1);
    if (!profile) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Kiosk profile not found' }); return; }
    reply.send(profile);
  });

  app.patch('/:id', {
    schema: { description: 'Update a kiosk profile', tags: ['kiosk'] },
    preHandler: [requirePermission('kiosk:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateKioskSchema.parse(request.body);
    const [updated] = await db.update(kioskProfiles).set({ ...body, updatedAt: new Date() }).where(and(eq(kioskProfiles.id, id), eq(kioskProfiles.orgId, request.user.orgId))).returning();
    if (!updated) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Kiosk profile not found' }); return; }
    reply.send(updated);
  });

  app.delete('/:id', {
    schema: { description: 'Delete a kiosk profile', tags: ['kiosk'] },
    preHandler: [requirePermission('kiosk:delete')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(kioskProfiles).where(and(eq(kioskProfiles.id, id), eq(kioskProfiles.orgId, request.user.orgId)));
    reply.status(204).send();
  });
}
