import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as appService from '../services/app-service.js';

const createAppSchema = z.object({
  name: z.string().min(1),
  package_name: z.string().min(1),
  description: z.string().optional(),
  platform: z.enum(['android', 'ios', 'web']),
  type: z.enum(['enterprise', 'public', 'system']).optional(),
  is_public: z.boolean().optional(),
  org_id: z.string().uuid(),
});

const updateAppSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  is_public: z.boolean().optional(),
  icon_url: z.string().optional(),
});

export const appRoutes: FastifyPluginAsync = async (app) => {
  // List apps
  app.get('/', async (request, reply) => {
    const { org_id, limit = '20', offset = '0' } = request.query as Record<string, string>;
    if (!org_id) return reply.status(400).send({ error: 'org_id query parameter required' });
    const result = await appService.listApps(org_id, parseInt(limit, 10), parseInt(offset, 10));
    return reply.send(result);
  });

  // Create app entry with metadata
  app.post('/', async (request, reply) => {
    const body = createAppSchema.parse(request.body);
    const created = await appService.createApp(body);
    return reply.status(201).send(created);
  });

  // Get single app
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const found = await appService.getApp(id);
    if (!found) return reply.status(404).send({ error: 'App not found' });
    return reply.send(found);
  });

  // Update app
  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateAppSchema.parse(request.body);
    const updated = await appService.updateApp(id, body);
    if (!updated) return reply.status(404).send({ error: 'App not found' });
    return reply.send(updated);
  });

  // Delete app
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await appService.deleteApp(id);
    if (!deleted) return reply.status(404).send({ error: 'App not found' });
    return reply.status(204).send();
  });

  // Enterprise app store endpoint - public catalog for device agents
  app.get('/store', async (request, reply) => {
    const { assigned_to_device_id } = request.query as Record<string, string>;
    const apps = await appService.getStoreApps(assigned_to_device_id || undefined);
    return reply.send({ apps });
  });
};
