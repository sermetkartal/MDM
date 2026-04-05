import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { deviceService } from '../services/device-service.js';
import { requirePermission } from '../middleware/rbac.js';
import { pool } from '../db/index.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  status: z.string().optional(),
  platform: z.string().optional(),
  search: z.string().optional(),
  complianceStatus: z.string().optional(),
});

const commandSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.unknown()).optional().default({}),
});

const telemetryQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  interval: z.string().default('1h'),
});

const locationHistorySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/', {
    schema: { description: 'List devices with pagination and filters', tags: ['devices'] },
    preHandler: [requirePermission('devices:read')],
  }, async (request, reply) => {
    const filters = paginationSchema.parse(request.query);
    const result = await deviceService.list(request.user.orgId, filters);
    reply.send(result);
  });

  app.get('/:id', {
    schema: { description: 'Get device by ID', tags: ['devices'] },
    preHandler: [requirePermission('devices:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await deviceService.getById(request.user.orgId, id);
    reply.send(device);
  });

  app.get('/:id/policies', {
    schema: { description: 'Get policies assigned to a device', tags: ['devices'] },
    preHandler: [requirePermission('devices:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const policies = await deviceService.getDevicePolicies(request.user.orgId, id);
    reply.send({ data: policies });
  });

  app.get('/:id/apps', {
    schema: { description: 'Get apps assigned to a device', tags: ['devices'] },
    preHandler: [requirePermission('devices:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const apps = await deviceService.getDeviceApps(request.user.orgId, id);
    reply.send({ data: apps });
  });

  app.get('/:id/compliance', {
    schema: { description: 'Get compliance violations for a device', tags: ['devices'] },
    preHandler: [requirePermission('devices:read', 'compliance:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const violations = await deviceService.getDeviceCompliance(request.user.orgId, id);
    reply.send({ data: violations });
  });

  app.post('/:id/commands', {
    schema: { description: 'Send a command to a device', tags: ['devices'] },
    preHandler: [requirePermission('commands:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = commandSchema.parse(request.body);
    const command = await deviceService.sendCommand(request.user.orgId, id, body.type, body.payload, request.user.sub);
    reply.status(201).send(command);
  });

  // --- Telemetry ---
  app.get('/:id/telemetry', {
    schema: { description: 'Get time-bucketed telemetry data for a device', tags: ['devices', 'telemetry'] },
    preHandler: [requirePermission('devices:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = telemetryQuerySchema.parse(request.query);

    // Verify device belongs to org
    await deviceService.getById(request.user.orgId, id);

    const fromDate = query.from ? new Date(query.from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDate = query.to ? new Date(query.to) : new Date();

    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT
          time_bucket($1::interval, time) AS bucket,
          AVG(CASE WHEN metric_type = 'battery_level' THEN metric_value::numeric END) AS battery,
          AVG(CASE WHEN metric_type = 'storage_free_mb' THEN metric_value::numeric END) AS storage,
          AVG(CASE WHEN metric_type = 'memory_free_mb' THEN metric_value::numeric END) AS memory,
          AVG(CASE WHEN metric_type = 'wifi_rssi' THEN metric_value::numeric END) AS wifi_signal,
          AVG(CASE WHEN metric_type = 'gps_latitude' THEN metric_value::numeric END) AS latitude,
          AVG(CASE WHEN metric_type = 'gps_longitude' THEN metric_value::numeric END) AS longitude
        FROM device_telemetry
        WHERE device_id = $2 AND time >= $3 AND time <= $4
        GROUP BY bucket
        ORDER BY bucket ASC`,
        [query.interval, id, fromDate, toDate]
      );

      const data = result.rows.map((row: any) => ({
        time: row.bucket,
        battery: row.battery ? parseFloat(row.battery) : null,
        storage: row.storage ? parseFloat(row.storage) : null,
        memory: row.memory ? parseFloat(row.memory) : null,
        wifi_signal: row.wifi_signal ? parseFloat(row.wifi_signal) : null,
        location: row.latitude && row.longitude ? { lat: parseFloat(row.latitude), lng: parseFloat(row.longitude) } : null,
      }));

      reply.send({ data });
    } finally {
      client.release();
    }
  });

  // --- Location History ---
  app.get('/:id/location-history', {
    schema: { description: 'Get location history for a device', tags: ['devices', 'telemetry'] },
    preHandler: [requirePermission('devices:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = locationHistorySchema.parse(request.query);

    await deviceService.getById(request.user.orgId, id);

    const fromDate = query.from ? new Date(query.from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDate = query.to ? new Date(query.to) : new Date();

    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT
          time AS timestamp,
          MAX(CASE WHEN metric_type = 'gps_latitude' THEN metric_value::numeric END) AS lat,
          MAX(CASE WHEN metric_type = 'gps_longitude' THEN metric_value::numeric END) AS lng,
          MAX(CASE WHEN metric_type = 'gps_accuracy' THEN metric_value::numeric END) AS accuracy
        FROM device_telemetry
        WHERE device_id = $1 AND time >= $2 AND time <= $3
        AND metric_type IN ('gps_latitude', 'gps_longitude', 'gps_accuracy')
        GROUP BY time
        HAVING MAX(CASE WHEN metric_type = 'gps_latitude' THEN metric_value END) IS NOT NULL
        ORDER BY time ASC`,
        [id, fromDate, toDate]
      );

      const data = result.rows.map((row: any) => ({
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
        accuracy: row.accuracy ? parseFloat(row.accuracy) : null,
        timestamp: row.timestamp,
      }));

      reply.send({ data });
    } finally {
      client.release();
    }
  });
}
