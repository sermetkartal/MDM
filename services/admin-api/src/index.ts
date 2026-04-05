import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { authenticate } from './middleware/auth.js';
import { registerSecurityHeaders } from './middleware/security-headers.js';
import { registerRateLimiter } from './middleware/rate-limiter.js';
import { registerSanitization } from './middleware/sanitize.js';
import { authRoutes } from './routes/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { policyRoutes } from './routes/policies.js';
import { groupRoutes } from './routes/groups.js';
import { commandRoutes } from './routes/commands.js';
import { appRoutes } from './routes/apps.js';
import { kioskRoutes } from './routes/kiosk.js';
import { complianceRoutes } from './routes/compliance.js';
import { geofenceRoutes } from './routes/geofences.js';
import { auditRoutes } from './routes/audit.js';
import { certificateRoutes } from './routes/certificates.js';
import { webhookRoutes } from './routes/webhooks.js';
import { enrollmentRoutes } from './routes/enrollment.js';
import { roleRoutes } from './routes/roles.js';
import { ssoSamlRoutes } from './routes/sso-saml.js';
import { ssoOidcRoutes } from './routes/sso-oidc.js';
import { scimRoutes } from './routes/scim.js';
import { ldapRoutes } from './routes/ldap.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { seedSystemRoles } from './db/seed.js';
import { pool } from './db/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: typeof authenticate;
  }
}

async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: 'x-request-id',
  });

  // --- Plugins ---
  await app.register(cors, { origin: config.CORS_ORIGIN, credentials: true });

  await app.register(jwt, { secret: config.JWT_SECRET });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'MDM Admin API',
        description: 'REST API for the MDM admin console',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          apiKey: { type: 'apiKey', in: 'header', name: config.API_KEY_HEADER },
        },
      },
      security: [{ bearerAuth: [] }, { apiKey: [] }],
    },
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  // --- Decorators ---
  app.decorate('authenticate', authenticate);

  // --- Security middleware ---
  registerSecurityHeaders(app);
  registerSanitization(app);
  registerRateLimiter(app);

  // --- Error handler ---
  app.setErrorHandler(errorHandler);

  // --- Health checks ---
  app.get('/health', { schema: { description: 'Health check', tags: ['system'] } }, async (request, reply) => {
    let dbOk = false;
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      dbOk = true;
    } catch {
      // db not reachable
    }

    const status = dbOk ? 'healthy' : 'degraded';
    reply.status(dbOk ? 200 : 503).send({
      status,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      checks: { database: dbOk ? 'connected' : 'disconnected' },
    });
  });

  // Liveness probe - always 200 if process is running
  app.get('/healthz', { schema: { description: 'Liveness probe', tags: ['system'] } }, async (_request, reply) => {
    reply.send({ status: 'alive' });
  });

  // Readiness probe - check dependencies
  app.get('/readyz', { schema: { description: 'Readiness probe', tags: ['system'] } }, async (_request, reply) => {
    let dbOk = false;
    let redisOk = false;

    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      dbOk = true;
    } catch { /* not ready */ }

    try {
      const Redis = (await import('ioredis')).default;
      const r = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
      await r.ping();
      await r.quit();
      redisOk = true;
    } catch { /* not ready */ }

    const ready = dbOk && redisOk;
    reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', database: dbOk, redis: redisOk });
  });

  // Detailed liveness - dependency status with latency
  app.get('/livez', { schema: { description: 'Detailed liveness', tags: ['system'] } }, async (_request, reply) => {
    const checks: Record<string, { status: string; latencyMs?: number }> = {};

    const dbStart = Date.now();
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      checks.database = { status: 'healthy', latencyMs: Date.now() - dbStart };
    } catch {
      checks.database = { status: 'unhealthy', latencyMs: Date.now() - dbStart };
    }

    const redisStart = Date.now();
    try {
      const Redis = (await import('ioredis')).default;
      const r = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
      await r.ping();
      await r.quit();
      checks.redis = { status: 'healthy', latencyMs: Date.now() - redisStart };
    } catch {
      checks.redis = { status: 'unhealthy', latencyMs: Date.now() - redisStart };
    }

    const allHealthy = Object.values(checks).every((c) => c.status === 'healthy');
    reply.status(allHealthy ? 200 : 503).send(checks);
  });

  // --- Routes ---
  await app.register(async (api) => {
    await api.register(authRoutes, { prefix: '/auth' });
    await api.register(deviceRoutes, { prefix: '/devices' });
    await api.register(policyRoutes, { prefix: '/policies' });
    await api.register(groupRoutes, { prefix: '/groups' });
    await api.register(commandRoutes, { prefix: '/commands' });
    await api.register(appRoutes, { prefix: '/apps' });
    await api.register(kioskRoutes, { prefix: '/kiosk' });
    await api.register(complianceRoutes, { prefix: '/compliance' });
    await api.register(geofenceRoutes, { prefix: '/geofences' });
    await api.register(auditRoutes, { prefix: '/audit' });
    await api.register(certificateRoutes, { prefix: '/certificates' });
    await api.register(webhookRoutes, { prefix: '/webhooks' });
    await api.register(enrollmentRoutes, { prefix: '/enrollment' });
    await api.register(roleRoutes, { prefix: '/roles' });
    await api.register(ssoSamlRoutes, { prefix: '/auth' });
    await api.register(ssoOidcRoutes, { prefix: '/auth' });
    await api.register(scimRoutes, { prefix: '/scim/v2' });
    await api.register(ldapRoutes, { prefix: '/ldap' });
    await api.register(apiKeyRoutes, { prefix: '/api-keys' });
  }, { prefix: '/api/v1' });

  return app;
}

async function start() {
  const app = await buildApp();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully`);
      await app.close();
      await pool.end();
      process.exit(0);
    });
  }

  try {
    // Seed system roles on startup
    await seedSystemRoles().catch((err) => app.log.warn('Failed to seed system roles:', err));

    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Admin API running at http://${config.HOST}:${config.PORT}`);
    app.log.info(`Swagger docs at http://${config.HOST}:${config.PORT}/docs`);
  } catch (err) {
    app.log.fatal(err);
    process.exit(1);
  }
}

start();

export { buildApp };
