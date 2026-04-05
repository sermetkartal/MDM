import { FastifyPluginAsync } from 'fastify';
import { queryAuditLogs, getAuditLogDetail, exportAuditLogs } from '../services/audit-service.js';

export const auditLogRoutes: FastifyPluginAsync = async (app) => {
  // List audit logs with filters and pagination
  app.get('/', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const org_id = query.org_id;
    if (!org_id) return reply.status(400).send({ error: 'org_id query parameter required' });

    const filters = {
      org_id,
      actor_type: query.actor_type,
      actor_id: query.actor_id,
      action: query.action,
      resource_type: query.resource_type,
      resource_id: query.resource_id,
      from_date: query.from,
      to_date: query.to,
      search: query.search,
      limit: parseInt(query.page_size ?? query.limit ?? '50', 10),
      offset: ((parseInt(query.page ?? '1', 10) - 1) * parseInt(query.page_size ?? query.limit ?? '50', 10)),
    };

    const result = await queryAuditLogs(filters);
    const page = parseInt(query.page ?? '1', 10);
    const pageSize = filters.limit;

    return reply.send({
      data: result.logs,
      pagination: {
        page,
        limit: pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    });
  });

  // Get single audit log entry with full detail
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const entry = await getAuditLogDetail(id);
    if (!entry) {
      return reply.status(404).send({ error: 'Audit log entry not found' });
    }

    return reply.send(entry);
  });

  // Export audit logs as CSV
  app.get('/export', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const org_id = query.org_id;
    if (!org_id) return reply.status(400).send({ error: 'org_id query parameter required' });

    const filters = {
      org_id,
      actor_type: query.actor_type,
      actor_id: query.actor_id,
      action: query.action,
      resource_type: query.resource_type,
      resource_id: query.resource_id,
      from_date: query.from,
      to_date: query.to,
      search: query.search,
      limit: 50000,
      offset: 0,
    };

    const csv = await exportAuditLogs(filters);

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="audit-logs.csv"');
    return reply.send(csv);
  });
};
