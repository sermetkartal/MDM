import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, ilike, count, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { users, roles, organizations, deviceGroups } from '../db/schema.js';

// SCIM Bearer token auth
async function scimAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Missing or invalid bearer token',
      status: '401',
    });
    return;
  }

  const token = authHeader.slice(7);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Look up org by SCIM token stored in settings
  const allOrgs = await db.select({ id: organizations.id, settings: organizations.settings }).from(organizations);
  let orgId: string | null = null;

  for (const org of allOrgs) {
    const settings = org.settings as Record<string, unknown> | null;
    const scimTokenHash = settings?.scimTokenHash as string | undefined;
    if (scimTokenHash && crypto.timingSafeEqual(Buffer.from(scimTokenHash), Buffer.from(tokenHash))) {
      orgId = org.id;
      break;
    }
  }

  if (!orgId) {
    reply.status(401).send({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Invalid SCIM token',
      status: '401',
    });
    return;
  }

  request.user = {
    sub: 'scim-provisioner',
    email: 'scim@system',
    orgId,
    roleId: '',
    permissions: ['*:*'],
  };
}

function toScimUser(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.id,
    userName: user.email,
    name: {
      givenName: user.firstName ?? '',
      familyName: user.lastName ?? '',
      formatted: [user.firstName, user.lastName].filter(Boolean).join(' '),
    },
    emails: [{ value: user.email, primary: true, type: 'work' }],
    displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
    active: user.isActive,
    meta: {
      resourceType: 'User',
      created: user.createdAt,
      lastModified: user.updatedAt,
    },
  };
}

const scimPaginationSchema = z.object({
  startIndex: z.coerce.number().int().min(1).default(1),
  count: z.coerce.number().int().min(1).max(100).default(25),
  filter: z.string().optional(),
});

const scimUserCreateSchema = z.object({
  schemas: z.array(z.string()),
  userName: z.string().min(1),
  name: z.object({
    givenName: z.string().optional(),
    familyName: z.string().optional(),
  }).optional(),
  emails: z.array(z.object({
    value: z.string().email(),
    primary: z.boolean().optional(),
    type: z.string().optional(),
  })).optional(),
  displayName: z.string().optional(),
  active: z.boolean().optional().default(true),
});

const scimPatchSchema = z.object({
  schemas: z.array(z.string()),
  Operations: z.array(z.object({
    op: z.enum(['add', 'replace', 'remove']),
    path: z.string().optional(),
    value: z.unknown().optional(),
  })),
});

export async function scimRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', scimAuth);

  // ServiceProviderConfig
  app.get('/ServiceProviderConfig', {
    schema: { description: 'SCIM Service Provider Configuration', tags: ['scim'] },
  }, async (_request, reply) => {
    reply.send({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      documentationUri: '',
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 100 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'Authentication via SCIM bearer token',
      }],
    });
  });

  // Schemas
  app.get('/Schemas', {
    schema: { description: 'List supported SCIM schemas', tags: ['scim'] },
  }, async (_request, reply) => {
    reply.send({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 2,
      Resources: [
        {
          id: 'urn:ietf:params:scim:schemas:core:2.0:User',
          name: 'User',
          description: 'User Account',
          attributes: [
            { name: 'userName', type: 'string', required: true, uniqueness: 'server' },
            { name: 'name', type: 'complex', subAttributes: [
              { name: 'givenName', type: 'string' },
              { name: 'familyName', type: 'string' },
            ]},
            { name: 'emails', type: 'complex', multiValued: true },
            { name: 'displayName', type: 'string' },
            { name: 'active', type: 'boolean' },
          ],
        },
        {
          id: 'urn:ietf:params:scim:schemas:core:2.0:Group',
          name: 'Group',
          description: 'Group',
          attributes: [
            { name: 'displayName', type: 'string', required: true },
            { name: 'members', type: 'complex', multiValued: true },
          ],
        },
      ],
    });
  });

  // List/search users
  app.get('/Users', {
    schema: { description: 'SCIM list/search users', tags: ['scim'] },
  }, async (request, reply) => {
    const orgId = request.user.orgId;
    const query = scimPaginationSchema.parse(request.query);
    const offset = query.startIndex - 1;

    let emailFilter: string | undefined;
    if (query.filter) {
      const match = query.filter.match(/userName\s+eq\s+"([^"]+)"/);
      emailFilter = match?.[1];
    }

    const conditions = emailFilter
      ? and(eq(users.orgId, orgId), eq(users.email, emailFilter))
      : eq(users.orgId, orgId);

    const [totalResult] = await db.select({ count: count() }).from(users).where(conditions);
    const userList = await db
      .select()
      .from(users)
      .where(conditions)
      .limit(query.count)
      .offset(offset);

    reply.send({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: totalResult.count,
      startIndex: query.startIndex,
      itemsPerPage: query.count,
      Resources: userList.map(toScimUser),
    });
  });

  // Get user
  app.get('/Users/:id', {
    schema: { description: 'SCIM get user by ID', tags: ['scim'] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.orgId;

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.orgId, orgId)))
      .limit(1);

    if (!user) {
      reply.status(404).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: '404',
      });
      return;
    }

    reply.send(toScimUser(user));
  });

  // Create user
  app.post('/Users', {
    schema: { description: 'SCIM create user', tags: ['scim'] },
  }, async (request, reply) => {
    const orgId = request.user.orgId;
    const body = scimUserCreateSchema.parse(request.body);
    const email = body.emails?.[0]?.value ?? body.userName;

    // Check if user already exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), eq(users.orgId, orgId)))
      .limit(1);

    if (existing) {
      reply.status(409).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User already exists',
        status: '409',
      });
      return;
    }

    // Get viewer role
    const [viewerRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.orgId, orgId), eq(roles.name, 'viewer'), eq(roles.isSystem, true)))
      .limit(1);

    const ssoPlaceholder = `sso$${crypto.randomBytes(16).toString('hex')}$disabled`;

    const [newUser] = await db
      .insert(users)
      .values({
        orgId,
        roleId: viewerRole?.id ?? '',
        email,
        passwordHash: ssoPlaceholder,
        firstName: body.name?.givenName ?? null,
        lastName: body.name?.familyName ?? null,
        isActive: body.active,
      })
      .returning();

    reply.status(201).send(toScimUser(newUser));
  });

  // Replace user (PUT)
  app.put('/Users/:id', {
    schema: { description: 'SCIM replace user', tags: ['scim'] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.orgId;
    const body = scimUserCreateSchema.parse(request.body);
    const email = body.emails?.[0]?.value ?? body.userName;

    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.orgId, orgId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: '404',
      });
      return;
    }

    const [updated] = await db
      .update(users)
      .set({
        email,
        firstName: body.name?.givenName ?? null,
        lastName: body.name?.familyName ?? null,
        isActive: body.active,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    reply.send(toScimUser(updated));
  });

  // Patch user
  app.patch('/Users/:id', {
    schema: { description: 'SCIM patch user', tags: ['scim'] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.orgId;
    const body = scimPatchSchema.parse(request.body);

    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.orgId, orgId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: '404',
      });
      return;
    }

    const updates: Partial<{ email: string; firstName: string | null; lastName: string | null; isActive: boolean }> = {};

    for (const op of body.Operations) {
      if (op.op === 'replace' || op.op === 'add') {
        if (op.path === 'active') updates.isActive = op.value as boolean;
        if (op.path === 'userName') updates.email = op.value as string;
        if (op.path === 'name.givenName') updates.firstName = op.value as string;
        if (op.path === 'name.familyName') updates.lastName = op.value as string;
        if (!op.path && typeof op.value === 'object' && op.value !== null) {
          const val = op.value as Record<string, unknown>;
          if ('active' in val) updates.isActive = val.active as boolean;
          if ('userName' in val) updates.email = val.userName as string;
        }
      }
      if (op.op === 'remove') {
        if (op.path === 'name.givenName') updates.firstName = null;
        if (op.path === 'name.familyName') updates.lastName = null;
      }
    }

    const [updated] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    reply.send(toScimUser(updated));
  });

  // Delete (deactivate) user
  app.delete('/Users/:id', {
    schema: { description: 'SCIM deactivate user', tags: ['scim'] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.orgId;

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, id), eq(users.orgId, orgId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: '404',
      });
      return;
    }

    await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, id));

    reply.status(204).send();
  });

  // List groups
  app.get('/Groups', {
    schema: { description: 'SCIM list groups', tags: ['scim'] },
  }, async (request, reply) => {
    const orgId = request.user.orgId;
    const query = scimPaginationSchema.parse(request.query);
    const offset = query.startIndex - 1;

    const [totalResult] = await db.select({ count: count() }).from(deviceGroups).where(eq(deviceGroups.orgId, orgId));
    const groups = await db
      .select()
      .from(deviceGroups)
      .where(eq(deviceGroups.orgId, orgId))
      .limit(query.count)
      .offset(offset);

    reply.send({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: totalResult.count,
      startIndex: query.startIndex,
      itemsPerPage: query.count,
      Resources: groups.map((g) => ({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        id: g.id,
        displayName: g.name,
        meta: { resourceType: 'Group', created: g.createdAt, lastModified: g.updatedAt },
      })),
    });
  });

  // Create group
  app.post('/Groups', {
    schema: { description: 'SCIM create group', tags: ['scim'] },
  }, async (request, reply) => {
    const orgId = request.user.orgId;
    const body = z.object({
      schemas: z.array(z.string()),
      displayName: z.string().min(1),
    }).parse(request.body);

    const [group] = await db
      .insert(deviceGroups)
      .values({
        orgId,
        name: body.displayName,
        description: 'Created via SCIM provisioning',
        isDynamic: false,
      })
      .returning();

    reply.status(201).send({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id: group.id,
      displayName: group.name,
      meta: { resourceType: 'Group', created: group.createdAt, lastModified: group.updatedAt },
    });
  });

  // Patch group
  app.patch('/Groups/:id', {
    schema: { description: 'SCIM patch group', tags: ['scim'] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.orgId;
    const body = scimPatchSchema.parse(request.body);

    const [existing] = await db
      .select()
      .from(deviceGroups)
      .where(and(eq(deviceGroups.id, id), eq(deviceGroups.orgId, orgId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'Group not found',
        status: '404',
      });
      return;
    }

    for (const op of body.Operations) {
      if ((op.op === 'replace' || op.op === 'add') && op.path === 'displayName') {
        await db
          .update(deviceGroups)
          .set({ name: op.value as string, updatedAt: new Date() })
          .where(eq(deviceGroups.id, id));
      }
    }

    const [updated] = await db.select().from(deviceGroups).where(eq(deviceGroups.id, id)).limit(1);

    reply.send({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id: updated.id,
      displayName: updated.name,
      meta: { resourceType: 'Group', created: updated.createdAt, lastModified: updated.updatedAt },
    });
  });
}
