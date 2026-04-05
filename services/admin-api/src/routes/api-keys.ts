import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema.js';

const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  permissions: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

const updateApiKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  permissions: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

function generateApiKey(isTest: boolean): { key: string; prefix: string; hash: string } {
  const prefixStr = isTest ? 'mdm_test_' : 'mdm_live_';
  const randomPart = crypto.randomBytes(32).toString('base64url');
  const key = `${prefixStr}${randomPart}`;
  const prefix = key.slice(0, 12);
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return { key, prefix, hash };
}

function maskKey(prefix: string, hash: string): string {
  return `${prefix}...${hash.slice(-4)}`;
}

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('onRequest', app.authenticate);

  // POST /api-keys - generate a new API key
  app.post('/', {
    schema: {
      description: 'Generate a new API key (shown once)',
      tags: ['api-keys'],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          permissions: { type: 'array', items: { type: 'string' } },
          expiresAt: { type: 'string', format: 'date-time' },
        },
        required: ['name'],
      },
    },
  }, async (request, reply) => {
    const body = createApiKeySchema.parse(request.body);
    const user = request.user;
    const isTest = process.env.NODE_ENV !== 'production';
    const { key, prefix, hash } = generateApiKey(isTest);

    const [created] = await db.insert(apiKeys).values({
      orgId: user.orgId,
      userId: user.sub,
      name: body.name,
      keyHash: hash,
      keyPrefix: prefix,
      permissions: body.permissions ?? [],
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    }).returning();

    reply.status(201).send({
      id: created.id,
      name: created.name,
      key, // Only shown once
      prefix: created.keyPrefix,
      permissions: created.permissions,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    });
  });

  // GET /api-keys - list all API keys (masked)
  app.get('/', {
    schema: {
      description: 'List API keys (prefix + last 4 chars only)',
      tags: ['api-keys'],
    },
  }, async (request, reply) => {
    const user = request.user;

    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        keyHash: apiKeys.keyHash,
        permissions: apiKeys.permissions,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        isActive: apiKeys.isActive,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.orgId, user.orgId));

    reply.send({
      data: keys.map((k) => ({
        id: k.id,
        name: k.name,
        maskedKey: maskKey(k.keyPrefix, k.keyHash),
        permissions: k.permissions,
        lastUsedAt: k.lastUsedAt,
        expiresAt: k.expiresAt,
        isActive: k.isActive,
        createdAt: k.createdAt,
      })),
    });
  });

  // DELETE /api-keys/:id - revoke an API key
  app.delete('/:id', {
    schema: {
      description: 'Revoke an API key',
      tags: ['api-keys'],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const [updated] = await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, user.orgId)))
      .returning({ id: apiKeys.id });

    if (!updated) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'API key not found' });
      return;
    }

    reply.send({ message: 'API key revoked', id: updated.id });
  });

  // PATCH /api-keys/:id - update name, permissions, expiry
  app.patch('/:id', {
    schema: {
      description: 'Update an API key',
      tags: ['api-keys'],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;
    const body = updateApiKeySchema.parse(request.body);

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.permissions !== undefined) updates.permissions = body.permissions;
    if (body.expiresAt !== undefined) updates.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'No fields to update' });
      return;
    }

    const [updated] = await db
      .update(apiKeys)
      .set(updates)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, user.orgId)))
      .returning();

    if (!updated) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'API key not found' });
      return;
    }

    reply.send({
      id: updated.id,
      name: updated.name,
      maskedKey: maskKey(updated.keyPrefix, updated.keyHash),
      permissions: updated.permissions,
      expiresAt: updated.expiresAt,
    });
  });

  // POST /api-keys/:id/rotate - rotate key (generate new, invalidate old)
  app.post('/:id/rotate', {
    schema: {
      description: 'Rotate an API key (generates new key, invalidates old)',
      tags: ['api-keys'],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    // Find the existing key
    const [existing] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, user.orgId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'API key not found' });
      return;
    }

    // Invalidate old key
    await db.update(apiKeys).set({ isActive: false }).where(eq(apiKeys.id, id));

    // Generate new key with same metadata
    const isTest = process.env.NODE_ENV !== 'production';
    const { key, prefix, hash } = generateApiKey(isTest);

    const [created] = await db.insert(apiKeys).values({
      orgId: existing.orgId,
      userId: existing.userId,
      name: existing.name,
      keyHash: hash,
      keyPrefix: prefix,
      permissions: existing.permissions as string[],
      expiresAt: existing.expiresAt,
    }).returning();

    reply.status(201).send({
      id: created.id,
      name: created.name,
      key, // Only shown once
      prefix: created.keyPrefix,
      permissions: created.permissions,
      expiresAt: created.expiresAt,
      previousKeyId: id,
      createdAt: created.createdAt,
    });
  });
}
