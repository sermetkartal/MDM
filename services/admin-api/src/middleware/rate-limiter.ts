import type { FastifyInstance, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import Redis from 'ioredis';
import { config } from '../config/index.js';

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

const ROUTE_LIMITS: Record<string, RateLimitConfig> = {
  login: { maxRequests: 5, windowSeconds: 60 },
  general: { maxRequests: 100, windowSeconds: 60 },
  upload: { maxRequests: 10, windowSeconds: 60 },
  bulk: { maxRequests: 20, windowSeconds: 60 },
};

const LOGIN_PATHS = ['/api/v1/auth/login', '/api/v1/auth/refresh'];
const UPLOAD_PATHS = ['/api/v1/apps/upload', '/api/v1/certificates/upload'];
const BULK_PATHS = ['/api/v1/commands/bulk', '/api/v1/devices/bulk'];

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redis.on('error', () => {});
  }
  return redis;
}

function classifyRoute(url: string): string {
  if (LOGIN_PATHS.some((p) => url.startsWith(p))) return 'login';
  if (UPLOAD_PATHS.some((p) => url.startsWith(p))) return 'upload';
  if (BULK_PATHS.some((p) => url.startsWith(p))) return 'bulk';
  return 'general';
}

function getIdentifier(request: FastifyRequest): string {
  const user = request.user;
  if (user?.sub) return `user:${user.sub}`;
  return `ip:${request.ip}`;
}

// Sliding window counter using Redis sorted sets
async function checkRateLimit(
  identifier: string,
  limitConfig: RateLimitConfig,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const r = getRedis();
  const key = `ratelimit:${identifier}`;
  const now = Date.now();
  const windowStart = now - limitConfig.windowSeconds * 1000;
  const resetAt = Math.ceil((now + limitConfig.windowSeconds * 1000) / 1000);

  const pipeline = r.pipeline();
  // Remove expired entries
  pipeline.zremrangebyscore(key, 0, windowStart);
  // Count current window entries
  pipeline.zcard(key);
  // Add current request
  pipeline.zadd(key, now.toString(), `${now}:${Math.random().toString(36).slice(2, 8)}`);
  // Set expiry on the key
  pipeline.expire(key, limitConfig.windowSeconds);

  const results = await pipeline.exec();
  const currentCount = (results?.[1]?.[1] as number) ?? 0;

  const allowed = currentCount < limitConfig.maxRequests;
  const remaining = Math.max(0, limitConfig.maxRequests - currentCount - (allowed ? 1 : 0));

  if (!allowed) {
    // Remove the entry we just added since the request is rejected
    const addResult = results?.[2];
    if (addResult) {
      // We already added it; remove the last entry to keep count accurate
      await r.zremrangebyscore(key, now.toString(), now.toString());
    }
  }

  return { allowed, remaining, resetAt };
}

export function rateLimiter(): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const routeClass = classifyRoute(request.url);
    const limitConfig = ROUTE_LIMITS[routeClass];
    const identifier = `${getIdentifier(request)}:${routeClass}`;

    try {
      const { allowed, remaining, resetAt } = await checkRateLimit(identifier, limitConfig);

      reply.header('X-RateLimit-Limit', limitConfig.maxRequests.toString());
      reply.header('X-RateLimit-Remaining', remaining.toString());
      reply.header('X-RateLimit-Reset', resetAt.toString());

      if (!allowed) {
        const retryAfter = Math.ceil(limitConfig.windowSeconds);
        reply.header('Retry-After', retryAfter.toString());
        reply.status(429).send({
          statusCode: 429,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        });
      }
    } catch {
      // If Redis is down, allow the request (fail open for availability)
      request.log.warn('Rate limiter Redis unavailable, allowing request');
    }
  };
}

export function registerRateLimiter(app: FastifyInstance): void {
  app.addHook('preHandler', rateLimiter());
}
