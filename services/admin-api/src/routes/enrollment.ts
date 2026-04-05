import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { eq, and, count, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { enrollmentConfigs, auditLogs } from '../db/schema.js';
import { requirePermission } from '../middleware/rbac.js';

const createConfigSchema = z.object({
  name: z.string().min(1).max(255),
  platform: z.enum(['ios', 'android', 'windows', 'macos', 'linux']).optional(),
  maxEnrollments: z.number().int().min(1).optional(),
  defaultGroupId: z.string().uuid().optional(),
  defaultPolicyId: z.string().uuid().optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function enrollmentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.post('/configs', {
    schema: { description: 'Create an enrollment configuration', tags: ['enrollment'] },
    preHandler: [requirePermission('enrollment:write')],
  }, async (request, reply) => {
    const body = createConfigSchema.parse(request.body);
    const token = crypto.randomBytes(32).toString('base64url');

    const [config] = await db.insert(enrollmentConfigs).values({
      ...body,
      token,
      orgId: request.user.orgId,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    }).returning();

    await db.insert(auditLogs).values({
      orgId: request.user.orgId,
      userId: request.user.sub,
      action: 'enrollment_config.created',
      resource: 'enrollment_config',
      resourceId: config.id,
    });

    reply.status(201).send(config);
  });

  app.get('/configs', {
    schema: { description: 'List enrollment configurations', tags: ['enrollment'] },
    preHandler: [requirePermission('enrollment:read')],
  }, async (request, reply) => {
    const { page = 1, limit = 25 } = request.query as { page?: number; limit?: number };
    const offset = (Number(page) - 1) * Number(limit);
    const where = eq(enrollmentConfigs.orgId, request.user.orgId);

    const [data, [{ total }]] = await Promise.all([
      db.select().from(enrollmentConfigs).where(where).orderBy(desc(enrollmentConfigs.createdAt)).limit(Number(limit)).offset(offset),
      db.select({ total: count() }).from(enrollmentConfigs).where(where),
    ]);

    reply.send({ data, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
  });

  app.get('/qr-code/:id', {
    schema: { description: 'Get QR code enrollment data for a config', tags: ['enrollment'] },
    preHandler: [requirePermission('enrollment:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [config] = await db
      .select()
      .from(enrollmentConfigs)
      .where(and(eq(enrollmentConfigs.id, id), eq(enrollmentConfigs.orgId, request.user.orgId)))
      .limit(1);

    if (!config) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Enrollment config not found' });
      return;
    }

    if (!config.isActive) {
      reply.status(410).send({ statusCode: 410, error: 'Gone', message: 'Enrollment config is inactive' });
      return;
    }

    if (config.expiresAt && config.expiresAt < new Date()) {
      reply.status(410).send({ statusCode: 410, error: 'Gone', message: 'Enrollment config has expired' });
      return;
    }

    if (config.maxEnrollments && config.currentEnrollments >= config.maxEnrollments) {
      reply.status(410).send({ statusCode: 410, error: 'Gone', message: 'Enrollment limit reached' });
      return;
    }

    // Return enrollment data that would be encoded into a QR code
    reply.send({
      enrollmentToken: config.token,
      platform: config.platform,
      configId: config.id,
      // The actual QR code image generation would be handled by the frontend
      qrData: JSON.stringify({
        type: 'mdm-enrollment',
        token: config.token,
        configId: config.id,
      }),
    });
  });
}
