import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { integrations, ldapSyncHistory, auditLogs } from '../db/schema.js';
import { requirePermission } from '../middleware/rbac.js';
import { ldapService, type LdapConfig } from '../services/ldap-service.js';

const ldapConfigSchema = z.object({
  url: z.string().min(1),
  bindDn: z.string().min(1),
  bindPassword: z.string().min(1),
  baseDn: z.string().min(1),
  userFilter: z.string().default('(objectClass=person)'),
  groupFilter: z.string().default('(objectClass=group)'),
  userMapping: z.object({
    email: z.string().default('mail'),
    firstName: z.string().default('givenName'),
    lastName: z.string().default('sn'),
    displayName: z.string().default('displayName'),
  }).default({}),
  groupMapping: z.object({
    name: z.string().default('cn'),
    description: z.string().default('description'),
    memberAttribute: z.string().default('member'),
  }).default({}),
  syncIntervalMinutes: z.number().int().min(5).max(1440).default(15),
});

const createIntegrationSchema = z.object({
  name: z.string().min(1).max(255),
  config: ldapConfigSchema,
});

export async function ldapRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // List LDAP integrations
  app.get('/', {
    schema: { description: 'List LDAP integrations', tags: ['ldap'] },
    preHandler: [requirePermission('settings:read')],
  }, async (request, reply) => {
    const data = await db.select().from(integrations)
      .where(and(eq(integrations.orgId, request.user.orgId), eq(integrations.type, 'ldap')))
      .orderBy(desc(integrations.createdAt));

    // Strip sensitive fields from config
    const sanitized = data.map(i => ({
      ...i,
      config: { ...i.config as any, bindPassword: '***' },
    }));

    reply.send({ data: sanitized });
  });

  // Create LDAP integration
  app.post('/', {
    schema: { description: 'Create LDAP integration', tags: ['ldap'] },
    preHandler: [requirePermission('settings:write')],
  }, async (request, reply) => {
    const body = createIntegrationSchema.parse(request.body);

    const [integration] = await db.insert(integrations).values({
      orgId: request.user.orgId,
      type: 'ldap' as any,
      name: body.name,
      config: body.config,
      isActive: true,
    }).returning();

    await db.insert(auditLogs).values({
      orgId: request.user.orgId,
      userId: request.user.sub,
      action: 'integration.ldap.created',
      resource: 'integration',
      resourceId: integration.id,
    });

    reply.status(201).send({
      ...integration,
      config: { ...body.config, bindPassword: '***' },
    });
  });

  // Update LDAP integration
  app.patch('/:id', {
    schema: { description: 'Update LDAP integration', tags: ['ldap'] },
    preHandler: [requirePermission('settings:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      name: z.string().min(1).max(255).optional(),
      config: ldapConfigSchema.partial().optional(),
      isActive: z.boolean().optional(),
    }).parse(request.body);

    // Get existing to merge config
    const [existing] = await db.select().from(integrations)
      .where(and(eq(integrations.id, id), eq(integrations.orgId, request.user.orgId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Integration not found' });
      return;
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (body.name) updateData.name = body.name;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.config) {
      updateData.config = { ...(existing.config as any), ...body.config };
    }

    const [updated] = await db.update(integrations)
      .set(updateData)
      .where(eq(integrations.id, id))
      .returning();

    reply.send({
      ...updated,
      config: { ...(updated.config as any), bindPassword: '***' },
    });
  });

  // Delete LDAP integration
  app.delete('/:id', {
    schema: { description: 'Delete LDAP integration', tags: ['ldap'] },
    preHandler: [requirePermission('settings:delete')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(integrations).where(and(eq(integrations.id, id), eq(integrations.orgId, request.user.orgId)));
    reply.status(204).send();
  });

  // Test connection
  app.post('/test-connection', {
    schema: { description: 'Test LDAP connection', tags: ['ldap'] },
    preHandler: [requirePermission('settings:write')],
  }, async (request, reply) => {
    const config = ldapConfigSchema.parse(request.body) as LdapConfig;
    const result = await ldapService.testConnection(config);
    reply.send(result);
  });

  // Sync now
  app.post('/:id/sync', {
    schema: { description: 'Trigger immediate LDAP sync', tags: ['ldap'] },
    preHandler: [requirePermission('settings:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [integration] = await db.select().from(integrations)
      .where(and(eq(integrations.id, id), eq(integrations.orgId, request.user.orgId)))
      .limit(1);

    if (!integration) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Integration not found' });
      return;
    }

    const config = integration.config as LdapConfig;
    const result = await ldapService.fullSync(id, request.user.orgId, config);

    await db.insert(auditLogs).values({
      orgId: request.user.orgId,
      userId: request.user.sub,
      action: 'integration.ldap.synced',
      resource: 'integration',
      resourceId: id,
      details: { usersSynced: result.usersSynced, groupsSynced: result.groupsSynced },
    });

    reply.send(result);
  });

  // Get sync history
  app.get('/:id/history', {
    schema: { description: 'Get LDAP sync history', tags: ['ldap'] },
    preHandler: [requirePermission('settings:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };
    const offset = (Number(page) - 1) * Number(limit);

    const data = await db.select().from(ldapSyncHistory)
      .where(eq(ldapSyncHistory.integrationId, id))
      .orderBy(desc(ldapSyncHistory.startedAt))
      .limit(Number(limit))
      .offset(offset);

    reply.send({ data });
  });
}
