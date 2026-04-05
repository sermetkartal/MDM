import Fastify from 'fastify';
import { config } from './config/index.js';
import { notificationRoutes } from './routes/notifications.js';
import { webhookRoutes } from './routes/webhooks.js';
import { integrationRoutes } from './routes/integrations.js';
import { notificationPreferencesRoutes } from './routes/notification-preferences.js';
import { startEventSubscriber } from './subscribers/event-subscriber.js';

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
    await api.register(notificationRoutes, { prefix: '/notifications' });
    await api.register(webhookRoutes, { prefix: '/webhooks' });
    await api.register(integrationRoutes, { prefix: '/integrations' });
    await api.register(notificationPreferencesRoutes, { prefix: '/notification-preferences' });
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
    await startEventSubscriber(app.log);
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Notification Service running at http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.fatal(err);
    process.exit(1);
  }
}

start();

export { buildApp };
