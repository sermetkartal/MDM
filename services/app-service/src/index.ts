import Fastify from 'fastify';
import { config } from './config/index.js';
import { appRoutes } from './routes/apps.js';
import { versionRoutes } from './routes/versions.js';
import { assignmentRoutes } from './routes/assignments.js';
import { startAssignmentSubscriber } from './services/app-service.js';

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
    await api.register(appRoutes, { prefix: '/apps' });
    await api.register(versionRoutes, { prefix: '/apps' });
    await api.register(assignmentRoutes, { prefix: '/apps' });
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
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`App Service running at http://${config.HOST}:${config.PORT}`);

    // Start NATS subscriber for app assignment events
    await startAssignmentSubscriber();
  } catch (err) {
    app.log.fatal(err);
    process.exit(1);
  }
}

start();

export { buildApp };
