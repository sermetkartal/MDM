import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { policyService } from '../services/policy-service.js';
import { requirePermission } from '../middleware/rbac.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const createPolicySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  platform: z.enum(['ios', 'android', 'windows', 'macos', 'linux']),
  payload: z.record(z.unknown()),
});

const updatePolicySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const assignmentSchema = z.object({
  deviceId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
});

export async function policyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/', {
    schema: { description: 'List policies', tags: ['policies'] },
    preHandler: [requirePermission('policies:read')],
  }, async (request, reply) => {
    const query = paginationSchema.parse(request.query);
    const result = await policyService.list(request.user.orgId, query);
    reply.send(result);
  });

  app.post('/', {
    schema: { description: 'Create a policy', tags: ['policies'] },
    preHandler: [requirePermission('policies:write')],
  }, async (request, reply) => {
    const body = createPolicySchema.parse(request.body);
    const policy = await policyService.create(request.user.orgId, body, request.user.sub);
    reply.status(201).send(policy);
  });

  app.get('/:id', {
    schema: { description: 'Get policy by ID', tags: ['policies'] },
    preHandler: [requirePermission('policies:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const policy = await policyService.getById(request.user.orgId, id);
    reply.send(policy);
  });

  app.patch('/:id', {
    schema: { description: 'Update a policy', tags: ['policies'] },
    preHandler: [requirePermission('policies:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updatePolicySchema.parse(request.body);
    const policy = await policyService.update(request.user.orgId, id, body, request.user.sub);
    reply.send(policy);
  });

  app.delete('/:id', {
    schema: { description: 'Delete a policy', tags: ['policies'] },
    preHandler: [requirePermission('policies:delete')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await policyService.delete(request.user.orgId, id, request.user.sub);
    reply.status(204).send();
  });

  app.get('/:id/versions', {
    schema: { description: 'Get policy version history', tags: ['policies'] },
    preHandler: [requirePermission('policies:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const versions = await policyService.getVersions(request.user.orgId, id);
    reply.send({ data: versions });
  });

  app.post('/:id/assignments', {
    schema: { description: 'Assign a policy to a device or group', tags: ['policies'] },
    preHandler: [requirePermission('policies:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = assignmentSchema.parse(request.body);
    const assignment = await policyService.createAssignment(request.user.orgId, id, body, request.user.sub);
    reply.status(201).send(assignment);
  });
}
