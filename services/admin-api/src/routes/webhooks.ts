import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { eq, and, count, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { webhooks, webhookDeliveries, auditLogs } from '../db/schema.js';
import { requirePermission } from '../middleware/rbac.js';

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  status: z.enum(['active', 'inactive']).default('active'),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/', {
    schema: { description: 'List webhooks', tags: ['webhooks'] },
    preHandler: [requirePermission('webhooks:read')],
  }, async (request, reply) => {
    const { page = 1, limit = 25 } = request.query as { page?: number; limit?: number };
    const offset = (Number(page) - 1) * Number(limit);
    const where = eq(webhooks.orgId, request.user.orgId);

    const [data, [{ total }]] = await Promise.all([
      db.select().from(webhooks).where(where).orderBy(desc(webhooks.createdAt)).limit(Number(limit)).offset(offset),
      db.select({ total: count() }).from(webhooks).where(where),
    ]);

    reply.send({ data, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
  });

  app.post('/', {
    schema: { description: 'Create a webhook', tags: ['webhooks'] },
    preHandler: [requirePermission('webhooks:write')],
  }, async (request, reply) => {
    const body = createWebhookSchema.parse(request.body);
    const secret = crypto.randomBytes(32).toString('hex');

    const [webhook] = await db.insert(webhooks).values({ ...body, secret, orgId: request.user.orgId }).returning();

    await db.insert(auditLogs).values({ orgId: request.user.orgId, userId: request.user.sub, action: 'webhook.created', resource: 'webhook', resourceId: webhook.id });
    // Return secret only on creation
    reply.status(201).send({ ...webhook, secret });
  });

  app.get('/:id', {
    schema: { description: 'Get webhook by ID', tags: ['webhooks'] },
    preHandler: [requirePermission('webhooks:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [webhook] = await db.select().from(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.orgId, request.user.orgId))).limit(1);
    if (!webhook) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Webhook not found' }); return; }
    // Don't expose secret after creation
    const { secret: _, ...safe } = webhook;
    reply.send(safe);
  });

  app.patch('/:id', {
    schema: { description: 'Update a webhook', tags: ['webhooks'] },
    preHandler: [requirePermission('webhooks:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateWebhookSchema.parse(request.body);
    const [updated] = await db.update(webhooks).set({ ...body, updatedAt: new Date() }).where(and(eq(webhooks.id, id), eq(webhooks.orgId, request.user.orgId))).returning();
    if (!updated) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Webhook not found' }); return; }
    const { secret: _, ...safe } = updated;
    reply.send(safe);
  });

  app.delete('/:id', {
    schema: { description: 'Delete a webhook', tags: ['webhooks'] },
    preHandler: [requirePermission('webhooks:delete')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.orgId, request.user.orgId)));
    reply.status(204).send();
  });

  app.get('/:id/deliveries', {
    schema: { description: 'List webhook deliveries', tags: ['webhooks'] },
    preHandler: [requirePermission('webhooks:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { page = 1, limit = 25 } = request.query as { page?: number; limit?: number };
    const offset = (Number(page) - 1) * Number(limit);

    // Verify webhook belongs to org
    const [webhook] = await db.select({ id: webhooks.id }).from(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.orgId, request.user.orgId))).limit(1);
    if (!webhook) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Webhook not found' }); return; }

    const where = eq(webhookDeliveries.webhookId, id);
    const [data, [{ total }]] = await Promise.all([
      db.select().from(webhookDeliveries).where(where).orderBy(desc(webhookDeliveries.createdAt)).limit(Number(limit)).offset(offset),
      db.select({ total: count() }).from(webhookDeliveries).where(where),
    ]);

    reply.send({ data, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
  });
}
