import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import crypto from 'node:crypto';
import Redis from 'ioredis';
import { db } from '../db/index.js';
import { apiKeys, users, roles } from '../db/schema.js';
import { config } from '../config/index.js';
import { pool } from '../db/index.js';

const SESSION_PREFIX = 'user:sessions:';
const ACTIVITY_PREFIX = 'session:activity:';
const SESSION_DATA_PREFIX = 'session:data:';
const DEFAULT_MAX_CONCURRENT_SESSIONS = 5;
const IDLE_TIMEOUT_SECONDS = 30 * 60; // 30 minutes
const ABSOLUTE_TIMEOUT_SECONDS = 24 * 60 * 60; // 24 hours

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redis.on('error', () => {});
  }
  return redis;
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Check for API key first
  const apiKey = request.headers[config.API_KEY_HEADER] as string | undefined;
  if (apiKey) {
    await authenticateApiKey(request, reply, apiKey);
    if (reply.sent) return;
    await setRlsContext(request);
    return;
  }

  // Fall back to JWT
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
    return;
  }

  // Session security checks
  const sessionValid = await validateSession(request, reply);
  if (!sessionValid) return;

  // Set RLS context for this request
  await setRlsContext(request);
}

async function authenticateApiKey(request: FastifyRequest, reply: FastifyReply, key: string): Promise<void> {
  const prefix = key.slice(0, 8);
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');

  const [apiKeyRecord] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyPrefix, prefix), eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!apiKeyRecord) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
    return;
  }

  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'API key has expired',
    });
    return;
  }

  // Load the associated user and role
  const [user] = await db
    .select()
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, apiKeyRecord.userId))
    .limit(1);

  if (!user) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'API key user not found',
    });
    return;
  }

  // Update last used timestamp (fire and forget)
  db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKeyRecord.id)).then(() => {});

  // Set JWT-compatible user on request
  request.user = {
    sub: user.users.id,
    email: user.users.email,
    orgId: user.users.orgId,
    roleId: user.users.roleId,
    permissions: (apiKeyRecord.permissions as string[]) ?? (user.roles.permissions as string[]) ?? [],
  };
}

// --- Session Security ---

async function validateSession(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const user = request.user;
  if (!user?.sub) return true; // No user to validate

  try {
    const r = getRedis();
    const sessionId = extractSessionId(request);
    if (!sessionId) return true; // No session tracking for this request

    // Check if session exists in user's session set
    const isMember = await r.sismember(`${SESSION_PREFIX}${user.sub}`, sessionId);
    if (!isMember) {
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Session has been revoked',
      });
      return false;
    }

    // Check idle timeout
    const lastActivity = await r.get(`${ACTIVITY_PREFIX}${sessionId}`);
    if (lastActivity) {
      const elapsed = Date.now() - parseInt(lastActivity, 10);
      if (elapsed > IDLE_TIMEOUT_SECONDS * 1000) {
        await revokeSession(user.sub, sessionId);
        reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Session expired due to inactivity',
        });
        return false;
      }
    }

    // Check absolute timeout
    const sessionData = await r.get(`${SESSION_DATA_PREFIX}${sessionId}`);
    if (sessionData) {
      const data = JSON.parse(sessionData);
      const elapsed = Date.now() - data.createdAt;
      if (elapsed > ABSOLUTE_TIMEOUT_SECONDS * 1000) {
        await revokeSession(user.sub, sessionId);
        reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Session expired (absolute timeout)',
        });
        return false;
      }

      // Optional IP binding check
      if (data.ipBinding && data.ip !== request.ip) {
        reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Session IP mismatch',
        });
        return false;
      }
    }

    // Update last activity
    await r.set(`${ACTIVITY_PREFIX}${sessionId}`, Date.now().toString(), 'EX', IDLE_TIMEOUT_SECONDS);
  } catch {
    // Redis unavailable - allow request (fail open)
  }

  return true;
}

function extractSessionId(request: FastifyRequest): string | null {
  // Session ID embedded in JWT jti claim
  const payload = request.user as any;
  return payload?.jti ?? null;
}

async function revokeSession(userId: string, sessionId: string): Promise<void> {
  try {
    const r = getRedis();
    await r.srem(`${SESSION_PREFIX}${userId}`, sessionId);
    await r.del(`${ACTIVITY_PREFIX}${sessionId}`);
    await r.del(`${SESSION_DATA_PREFIX}${sessionId}`);
  } catch {
    // Non-critical
  }
}

export async function registerSession(
  userId: string,
  sessionId: string,
  ip: string,
  ipBinding: boolean = false,
  maxSessions: number = DEFAULT_MAX_CONCURRENT_SESSIONS,
): Promise<void> {
  try {
    const r = getRedis();
    const sessionKey = `${SESSION_PREFIX}${userId}`;

    // Check current session count
    const currentCount = await r.scard(sessionKey);
    if (currentCount >= maxSessions) {
      // Get all sessions and revoke the oldest
      const sessions = await r.smembers(sessionKey);
      let oldestSession: string | null = null;
      let oldestTime = Infinity;

      for (const sid of sessions) {
        const data = await r.get(`${SESSION_DATA_PREFIX}${sid}`);
        if (data) {
          const parsed = JSON.parse(data);
          if (parsed.createdAt < oldestTime) {
            oldestTime = parsed.createdAt;
            oldestSession = sid;
          }
        } else {
          // No data means stale session - remove it
          oldestSession = sid;
          break;
        }
      }

      if (oldestSession) {
        await revokeSession(userId, oldestSession);
      }
    }

    // Register the new session
    await r.sadd(sessionKey, sessionId);
    await r.set(
      `${SESSION_DATA_PREFIX}${sessionId}`,
      JSON.stringify({ createdAt: Date.now(), ip, ipBinding }),
      'EX',
      ABSOLUTE_TIMEOUT_SECONDS,
    );
    await r.set(`${ACTIVITY_PREFIX}${sessionId}`, Date.now().toString(), 'EX', IDLE_TIMEOUT_SECONDS);
  } catch {
    // Non-critical
  }
}

export async function revokeAllSessions(userId: string): Promise<void> {
  try {
    const r = getRedis();
    const sessions = await r.smembers(`${SESSION_PREFIX}${userId}`);
    for (const sid of sessions) {
      await revokeSession(userId, sid);
    }
  } catch {
    // Non-critical
  }
}

// --- Row-Level Security Context ---

async function setRlsContext(request: FastifyRequest): Promise<void> {
  const user = request.user;
  if (!user?.orgId) return;

  try {
    const client = await pool.connect();
    try {
      await client.query(`SET LOCAL app.current_org_id = '${user.orgId}'`);
    } finally {
      client.release();
    }
  } catch (err) {
    request.log.warn({ err }, 'Failed to set RLS context');
  }
}
