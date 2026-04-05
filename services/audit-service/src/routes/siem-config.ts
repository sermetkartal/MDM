import { FastifyPluginAsync } from 'fastify';
import { getSIEMConfig, setSIEMConfig, sendTestEvent, type SIEMConfig } from '../services/siem-forwarder.js';

export const siemConfigRoutes: FastifyPluginAsync = async (app) => {
  // Get current SIEM integration config
  app.get('/config', async (_request, reply) => {
    const cfg = getSIEMConfig();
    if (!cfg) {
      return reply.send({ configured: false, config: null });
    }
    // Don't expose the full token
    return reply.send({
      configured: true,
      config: {
        type: cfg.type,
        endpoint: cfg.endpoint,
        token: cfg.token ? `${cfg.token.substring(0, 8)}...` : '',
        enabled: cfg.enabled,
      },
    });
  });

  // Update SIEM integration config
  app.put('/config', async (request, reply) => {
    const body = request.body as SIEMConfig;

    if (!body.type || !body.endpoint) {
      return reply.status(400).send({ error: 'type and endpoint are required' });
    }

    if (!['splunk_hec', 'syslog', 'qradar'].includes(body.type)) {
      return reply.status(400).send({ error: 'type must be one of: splunk_hec, syslog, qradar' });
    }

    setSIEMConfig({
      type: body.type,
      endpoint: body.endpoint,
      token: body.token ?? '',
      enabled: body.enabled ?? false,
    });

    return reply.send({ message: 'SIEM configuration updated' });
  });

  // Send test event to configured SIEM
  app.post('/test', async (_request, reply) => {
    const result = await sendTestEvent();
    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }
    return reply.send({ message: 'Test event sent successfully' });
  });
};
