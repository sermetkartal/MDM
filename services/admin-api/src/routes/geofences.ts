import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, count, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { geofences, geofencePolicies, geofenceEvents, auditLogs } from '../db/schema.js';
import { requirePermission } from '../middleware/rbac.js';

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const circleSchema = z.object({
  type: z.literal('circle'),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  center_lat: z.number().min(-90).max(90),
  center_lng: z.number().min(-180).max(180),
  radius_meters: z.number().min(50).max(50000),
  dwell_time_seconds: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

const polygonSchema = z.object({
  type: z.literal('polygon'),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  points: z.array(pointSchema).min(3),
  dwell_time_seconds: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

const createGeofenceSchema = z.discriminatedUnion('type', [circleSchema, polygonSchema]);

const updateGeofenceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  type: z.enum(['circle', 'polygon']).optional(),
  center_lat: z.number().min(-90).max(90).optional(),
  center_lng: z.number().min(-180).max(180).optional(),
  radius_meters: z.number().min(50).max(50000).optional(),
  points: z.array(pointSchema).min(3).optional(),
  dwell_time_seconds: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

const createPolicySchema = z.object({
  trigger_type: z.enum(['enter', 'exit', 'dwell']),
  action_type: z.enum(['lock', 'restrict', 'notify', 'enable_policy']),
  action_config: z.record(z.unknown()).default({}),
});

export async function geofenceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // List geofences
  app.get('/', {
    schema: { description: 'List geofences', tags: ['geofences'] },
    preHandler: [requirePermission('geofences:read')],
  }, async (request, reply) => {
    const { page = 1, limit = 25 } = request.query as { page?: number; limit?: number };
    const offset = (Number(page) - 1) * Number(limit);
    const where = eq(geofences.orgId, request.user.orgId);

    const [data, [{ total }]] = await Promise.all([
      db.select().from(geofences).where(where).orderBy(desc(geofences.createdAt)).limit(Number(limit)).offset(offset),
      db.select({ total: count() }).from(geofences).where(where),
    ]);

    reply.send({ data, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
  });

  // Create geofence with circle/polygon validation
  app.post('/', {
    schema: { description: 'Create a geofence', tags: ['geofences'] },
    preHandler: [requirePermission('geofences:write')],
  }, async (request, reply) => {
    const body = createGeofenceSchema.parse(request.body);

    const insertValues: Record<string, unknown> = {
      orgId: request.user.orgId,
      name: body.name,
      description: body.description,
      type: body.type,
      dwellTimeSeconds: body.dwell_time_seconds,
      isActive: body.is_active,
    };

    if (body.type === 'circle') {
      insertValues.centerLat = String(body.center_lat);
      insertValues.centerLng = String(body.center_lng);
      insertValues.radiusMeters = body.radius_meters;
    } else {
      // For polygon, store center as centroid and points in the action/polygon field
      const centroid = computeCentroid(body.points);
      insertValues.centerLat = String(centroid.lat);
      insertValues.centerLng = String(centroid.lng);
      insertValues.radiusMeters = 0;
      insertValues.polygon = body.points;
    }

    const [fence] = await db.insert(geofences).values(insertValues as any).returning();

    await db.insert(auditLogs).values({
      orgId: request.user.orgId,
      userId: request.user.sub,
      action: 'geofence.created',
      resource: 'geofence',
      resourceId: fence.id,
    });

    reply.status(201).send(fence);
  });

  // Get geofence by ID
  app.get('/:id', {
    schema: { description: 'Get geofence by ID', tags: ['geofences'] },
    preHandler: [requirePermission('geofences:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [fence] = await db.select().from(geofences).where(and(eq(geofences.id, id), eq(geofences.orgId, request.user.orgId))).limit(1);
    if (!fence) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Geofence not found' }); return; }
    reply.send(fence);
  });

  // Update geofence
  app.patch('/:id', {
    schema: { description: 'Update a geofence', tags: ['geofences'] },
    preHandler: [requirePermission('geofences:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateGeofenceSchema.parse(request.body);

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updateValues.name = body.name;
    if (body.description !== undefined) updateValues.description = body.description;
    if (body.type !== undefined) updateValues.type = body.type;
    if (body.center_lat !== undefined) updateValues.centerLat = String(body.center_lat);
    if (body.center_lng !== undefined) updateValues.centerLng = String(body.center_lng);
    if (body.radius_meters !== undefined) updateValues.radiusMeters = body.radius_meters;
    if (body.points !== undefined) updateValues.polygon = body.points;
    if (body.dwell_time_seconds !== undefined) updateValues.dwellTimeSeconds = body.dwell_time_seconds;
    if (body.is_active !== undefined) updateValues.isActive = body.is_active;

    const [updated] = await db.update(geofences).set(updateValues as any).where(and(eq(geofences.id, id), eq(geofences.orgId, request.user.orgId))).returning();
    if (!updated) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Geofence not found' }); return; }

    await db.insert(auditLogs).values({
      orgId: request.user.orgId,
      userId: request.user.sub,
      action: 'geofence.updated',
      resource: 'geofence',
      resourceId: id,
    });

    reply.send(updated);
  });

  // Delete geofence
  app.delete('/:id', {
    schema: { description: 'Delete a geofence', tags: ['geofences'] },
    preHandler: [requirePermission('geofences:delete')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(geofences).where(and(eq(geofences.id, id), eq(geofences.orgId, request.user.orgId)));

    await db.insert(auditLogs).values({
      orgId: request.user.orgId,
      userId: request.user.sub,
      action: 'geofence.deleted',
      resource: 'geofence',
      resourceId: id,
    });

    reply.status(204).send();
  });

  // Add policy/action trigger to a geofence
  app.post('/:id/policies', {
    schema: { description: 'Add action trigger to geofence', tags: ['geofences'] },
    preHandler: [requirePermission('geofences:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createPolicySchema.parse(request.body);

    // Verify the geofence exists and belongs to the org
    const [fence] = await db.select().from(geofences).where(and(eq(geofences.id, id), eq(geofences.orgId, request.user.orgId))).limit(1);
    if (!fence) { reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Geofence not found' }); return; }

    const [policy] = await db.insert(geofencePolicies).values({
      geofenceId: id,
      triggerType: body.trigger_type,
      actionType: body.action_type,
      actionConfig: body.action_config,
    }).returning();

    reply.status(201).send(policy);
  });

  // List policies for a geofence
  app.get('/:id/policies', {
    schema: { description: 'List policies for a geofence', tags: ['geofences'] },
    preHandler: [requirePermission('geofences:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await db.select().from(geofencePolicies).where(eq(geofencePolicies.geofenceId, id));
    reply.send({ data });
  });

  // Delete a geofence policy
  app.delete('/:id/policies/:policyId', {
    schema: { description: 'Delete a geofence policy', tags: ['geofences'] },
    preHandler: [requirePermission('geofences:write')],
  }, async (request, reply) => {
    const { policyId } = request.params as { id: string; policyId: string };
    await db.delete(geofencePolicies).where(eq(geofencePolicies.id, policyId));
    reply.status(204).send();
  });

  // List recent events for a geofence
  app.get('/:id/events', {
    schema: { description: 'List recent geofence events', tags: ['geofences'] },
    preHandler: [requirePermission('geofences:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit = 50 } = request.query as { limit?: number };
    const data = await db.select().from(geofenceEvents)
      .where(eq(geofenceEvents.geofenceId, id))
      .orderBy(desc(geofenceEvents.occurredAt))
      .limit(Number(limit));
    reply.send({ data });
  });

  // List devices currently inside a geofence
  app.get('/:id/devices', {
    schema: { description: 'List devices inside a geofence', tags: ['geofences'] },
    preHandler: [requirePermission('geofences:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Get the most recent event per device for this geofence,
    // filtering for "enter" or "dwell" without a subsequent "exit"
    const events = await db.select().from(geofenceEvents)
      .where(eq(geofenceEvents.geofenceId, id))
      .orderBy(desc(geofenceEvents.occurredAt));

    const deviceStates = new Map<string, { deviceId: string; trigger: string; lastSeen: Date }>();
    for (const event of events) {
      if (!deviceStates.has(event.deviceId)) {
        deviceStates.set(event.deviceId, {
          deviceId: event.deviceId,
          trigger: event.triggerType,
          lastSeen: event.occurredAt,
        });
      }
    }

    const insideDevices = Array.from(deviceStates.values())
      .filter(d => d.trigger === 'enter' || d.trigger === 'dwell');

    reply.send({ data: insideDevices });
  });
}

function computeCentroid(points: { lat: number; lng: number }[]): { lat: number; lng: number } {
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 }
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}
