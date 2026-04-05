import Fastify from 'fastify';
import { config } from './config/index.js';
import { auditLogRoutes } from './routes/audit-logs.js';
import { siemConfigRoutes } from './routes/siem-config.js';
import { startAuditSubscriber } from './subscribers/audit-subscriber.js';

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

  app.get('/healthz', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await app.register(async (api) => {
    await api.register(auditLogRoutes, { prefix: '/audit-logs' });
    await api.register(siemConfigRoutes, { prefix: '/siem' });
  }, { prefix: '/api/v1' });

  return app;
}

async function start() {
  const app = await buildApp();

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully`);
      await app.close();
      process.exit(0);
    });
  }

  try {
    await startAuditSubscriber(app.log);
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Audit Service running at http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.fatal(err);
    process.exit(1);
  }
}

start();

export { buildApp };
