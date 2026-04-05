import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import { db } from '../db/index.js';
import { roles } from '../db/schema.js';
import { config } from '../config/index.js';

const CACHE_TTL = 300; // 5 minutes
const CACHE_PREFIX = 'user:permissions:';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redis.on('error', () => {}); // Suppress unhandled errors; cache miss is acceptable
  }
  return redis;
}

function matchesPermission(userPerm: string, requiredPerm: string): boolean {
  if (userPerm === '*:*') return true;
  if (userPerm === requiredPerm) return true;

  const [userResource, userAction] = userPerm.split(':');
  const [reqResource, reqAction] = requiredPerm.split(':');

  // "*:read" matches "devices:read", "policies:read", etc.
  if (userResource === '*' && userAction === reqAction) return true;

  // "devices:*" matches "devices:read", "devices:write", etc.
  if (userResource === reqResource && userAction === '*') return true;

  return false;
}

async function getCachedPermissions(userId: string): Promise<string[] | null> {
  try {
    const r = getRedis();
    const cached = await r.get(`${CACHE_PREFIX}${userId}`);
    if (cached) return JSON.parse(cached);
  } catch {
    // Cache miss, fall through
  }
  return null;
}

async function cachePermissions(userId: string, permissions: string[]): Promise<void> {
  try {
    const r = getRedis();
    await r.set(`${CACHE_PREFIX}${userId}`, JSON.stringify(permissions), 'EX', CACHE_TTL);
  } catch {
    // Non-critical
  }
}

export async function invalidateUserPermissions(userId: string): Promise<void> {
  try {
    const r = getRedis();
    await r.del(`${CACHE_PREFIX}${userId}`);
  } catch {
    // Non-critical
  }
}

async function resolvePermissions(userId: string, roleId: string): Promise<string[]> {
  const cached = await getCachedPermissions(userId);
  if (cached) return cached;

  const [role] = await db
    .select({ permissions: roles.permissions })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);

  const permissions = (role?.permissions as string[]) ?? [];
  await cachePermissions(userId, permissions);
  return permissions;
}

export function requirePermission(...requiredPermissions: string[]): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) {
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    const userPermissions = await resolvePermissions(user.sub, user.roleId);

    const hasAll = requiredPermissions.every((required) =>
      userPermissions.some((userPerm) => matchesPermission(userPerm, required)),
    );

    if (!hasAll) {
      reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Missing required permissions: ${requiredPermissions.join(', ')}`,
      });
    }
  };
}
