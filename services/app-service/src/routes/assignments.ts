import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as appService from '../services/app-service.js';

const createAssignmentSchema = z.object({
  target_type: z.enum(['device', 'group', 'org']),
  target_id: z.string().uuid(),
  install_type: z.enum(['required', 'optional', 'prohibited']),
});

const driftCheckSchema = z.object({
  device_id: z.string().uuid(),
  installed_apps: z.array(z.object({
    package_name: z.string().min(1),
    version_code: z.number().int(),
    version_name: z.string().min(1),
    is_system: z.boolean(),
  })),
});

export const assignmentRoutes: FastifyPluginAsync = async (app) => {
  // Create assignment with install_type (required/optional/prohibited)
  app.post('/:id/assignments', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createAssignmentSchema.parse(request.body);

    const found = await appService.getApp(id);
    if (!found) return reply.status(404).send({ error: 'App not found' });

    const assignment = await appService.createAssignment(id, body);
    return reply.status(201).send(assignment);
  });

  // List assignments for an app
  app.get('/:id/assignments', async (request, reply) => {
    const { id } = request.params as { id: string };
    const assignments = await appService.listAssignments(id);
    return reply.send({ assignments });
  });

  // Remove assignment
  app.delete('/:id/assignments/:aid', async (request, reply) => {
    const { id, aid } = request.params as { id: string; aid: string };
    const deleted = await appService.deleteAssignment(id, aid);
    if (!deleted) return reply.status(404).send({ error: 'Assignment not found' });
    return reply.status(204).send();
  });

  // Drift detection endpoint: compare installed apps with assignments
  app.post('/drift-check', async (request, reply) => {
    const body = driftCheckSchema.parse(request.body);
    const drift = await appService.detectDrift(body.device_id, body.installed_apps);
    return reply.send(drift);
  });
};
