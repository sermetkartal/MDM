import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { roles, users } from '../db/schema.js';
import { requirePermission } from '../middleware/rbac.js';
import { invalidateUserPermissions } from '../middleware/rbac.js';

const createRoleSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().optional(),
  permissions: z.array(z.string()).min(1),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).min(1).optional(),
});

const assignUserSchema = z.object({
  userId: z.string().uuid(),
});

export async function roleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // List roles for org
  app.get('/', {
    schema: { description: 'List roles for the organization', tags: ['roles'] },
    preHandler: [requirePermission('settings:read')],
  }, async (request, reply) => {
    const orgId = request.user.orgId;
    const result = await db
      .select()
      .from(roles)
      .where(eq(roles.orgId, orgId))
      .orderBy(roles.isSystem, roles.name);

    reply.send({ data: result });
  });

  // Create custom role
  app.post('/', {
    schema: { description: 'Create a custom role', tags: ['roles'] },
    preHandler: [requirePermission('settings:write')],
  }, async (request, reply) => {
    const orgId = request.user.orgId;
    const body = createRoleSchema.parse(request.body);

    const [role] = await db
      .insert(roles)
      .values({
        orgId,
        name: body.name,
        description: body.description ?? null,
        permissions: body.permissions,
        isSystem: false,
      })
      .returning();

    reply.status(201).send({ data: role });
  });

  // Update role
  app.patch('/:id', {
    schema: { description: 'Update a role (cannot modify system roles)', tags: ['roles'] },
    preHandler: [requirePermission('settings:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.orgId;
    const body = updateRoleSchema.parse(request.body);

    const [existing] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.orgId, orgId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Role not found' });
      return;
    }

    if (existing.isSystem) {
      reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Cannot modify system roles' });
      return;
    }

    const [updated] = await db
      .update(roles)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();

    // Invalidate permissions for all users with this role
    const usersWithRole = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.roleId, id));

    for (const u of usersWithRole) {
      await invalidateUserPermissions(u.id);
    }

    reply.send({ data: updated });
  });

  // Delete role
  app.delete('/:id', {
    schema: { description: 'Delete a role (cannot delete system roles or roles with assigned users)', tags: ['roles'] },
    preHandler: [requirePermission('settings:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.orgId;

    const [existing] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.orgId, orgId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Role not found' });
      return;
    }

    if (existing.isSystem) {
      reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Cannot delete system roles' });
      return;
    }

    const [userCount] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.roleId, id));

    if (userCount.count > 0) {
      reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: `Cannot delete role: ${userCount.count} user(s) are still assigned`,
      });
      return;
    }

    await db.delete(roles).where(eq(roles.id, id));
    reply.status(204).send();
  });

  // Assign role to user
  app.post('/:id/users', {
    schema: { description: 'Assign a role to a user', tags: ['roles'] },
    preHandler: [requirePermission('settings:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.orgId;
    const body = assignUserSchema.parse(request.body);

    const [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.orgId, orgId)))
      .limit(1);

    if (!role) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Role not found' });
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, body.userId), eq(users.orgId, orgId)))
      .limit(1);

    if (!user) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found' });
      return;
    }

    await db
      .update(users)
      .set({ roleId: id, updatedAt: new Date() })
      .where(eq(users.id, body.userId));

    await invalidateUserPermissions(body.userId);

    reply.send({ data: { userId: body.userId, roleId: id } });
  });

  // Remove role from user (set to viewer)
  app.delete('/:id/users/:userId', {
    schema: { description: 'Remove a role from a user (sets to viewer)', tags: ['roles'] },
    preHandler: [requirePermission('settings:write')],
  }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    const orgId = request.user.orgId;

    // Find viewer role for this org
    const [viewerRole] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.orgId, orgId), eq(roles.name, 'viewer'), eq(roles.isSystem, true)))
      .limit(1);

    if (!viewerRole) {
      reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Viewer role not found' });
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.orgId, orgId), eq(users.roleId, id)))
      .limit(1);

    if (!user) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found with this role' });
      return;
    }

    await db
      .update(users)
      .set({ roleId: viewerRole.id, updatedAt: new Date() })
      .where(eq(users.id, userId));

    await invalidateUserPermissions(userId);

    reply.status(204).send();
  });
}
