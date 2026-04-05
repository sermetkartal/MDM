import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, count, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { commands, devices, auditLogs } from '../db/schema.js';
import { requirePermission } from '../middleware/rbac.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().optional(),
  type: z.string().optional(),
  deviceId: z.string().uuid().optional(),
});

const bulkCommandSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.unknown()).optional().default({}),
  deviceIds: z.array(z.string().uuid()).min(1).max(500),
});

export async function commandRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/', {
    schema: { description: 'List commands', tags: ['commands'] },
    preHandler: [requirePermission('commands:read')],
  }, async (request, reply) => {
    const filters = paginationSchema.parse(request.query);
    const { page, limit, status, type, deviceId } = filters;
    const offset = (page - 1) * limit;

    const conditions = [eq(commands.orgId, request.user.orgId)];
    if (status) conditions.push(eq(commands.status, status as any));
    if (type) conditions.push(eq(commands.type, type));
    if (deviceId) conditions.push(eq(commands.deviceId, deviceId));

    const where = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      db.select().from(commands).where(where).orderBy(desc(commands.issuedAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(commands).where(where),
    ]);

    reply.send({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  });

  app.get('/:id', {
    schema: { description: 'Get command by ID', tags: ['commands'] },
    preHandler: [requirePermission('commands:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [command] = await db.select().from(commands).where(and(eq(commands.id, id), eq(commands.orgId, request.user.orgId))).limit(1);
    if (!command) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Command not found' }); return; }
    reply.send(command);
  });

  app.post('/:id/cancel', {
    schema: { description: 'Cancel a pending command', tags: ['commands'] },
    preHandler: [requirePermission('commands:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [command] = await db.select().from(commands).where(and(eq(commands.id, id), eq(commands.orgId, request.user.orgId))).limit(1);

    if (!command) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Command not found' }); return; }
    if (command.status !== 'pending' && command.status !== 'queued') {
      reply.status(409).send({ statusCode: 409, error: 'Conflict', message: `Cannot cancel command in ${command.status} status` });
      return;
    }

    const [updated] = await db.update(commands).set({ status: 'cancelled' }).where(eq(commands.id, id)).returning();

    await db.insert(auditLogs).values({
      orgId: request.user.orgId,
      userId: request.user.sub,
      action: 'command.cancelled',
      resource: 'command',
      resourceId: id,
    });

    reply.send(updated);
  });

  app.post('/bulk', {
    schema: { description: 'Send a command to multiple devices', tags: ['commands'] },
    preHandler: [requirePermission('commands:write')],
  }, async (request, reply) => {
    const body = bulkCommandSchema.parse(request.body);
    const orgId = request.user.orgId;

    // Verify all devices belong to the org
    const orgDevices = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.orgId, orgId));
    const orgDeviceIds = new Set(orgDevices.map((d) => d.id));
    const invalidIds = body.deviceIds.filter((id) => !orgDeviceIds.has(id));

    if (invalidIds.length > 0) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `Devices not found: ${invalidIds.join(', ')}`,
      });
      return;
    }

    const rows = body.deviceIds.map((deviceId) => ({
      orgId,
      deviceId,
      type: body.type,
      payload: body.payload,
      issuedBy: request.user.sub,
      status: 'pending' as const,
    }));

    const created = await db.insert(commands).values(rows).returning();

    await db.insert(auditLogs).values({
      orgId,
      userId: request.user.sub,
      action: 'command.bulk_sent',
      resource: 'command',
      details: { type: body.type, count: body.deviceIds.length },
    });

    reply.status(201).send({ data: created, count: created.length });
  });
}
