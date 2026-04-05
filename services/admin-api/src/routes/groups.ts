import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, count, desc, isNull, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { deviceGroups, deviceGroupMembers, policyAssignments, policies, auditLogs } from '../db/schema.js';
import { requirePermission } from '../middleware/rbac.js';
import { dynamicGroupService, type RuleGroup } from '../services/dynamic-groups.js';

const MAX_GROUP_DEPTH = 5;

const ruleConditionSchema: z.ZodType<any> = z.object({
  field: z.string(),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains', 'starts_with', 'in', 'regex']),
  value: z.union([z.string(), z.array(z.string())]),
});

const ruleGroupSchema: z.ZodType<any> = z.object({
  operator: z.enum(['and', 'or']),
  conditions: z.array(z.lazy(() => z.union([ruleConditionSchema, ruleGroupSchema]))),
});

const createGroupSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['static', 'dynamic']).default('static'),
  parentId: z.string().uuid().nullable().optional(),
  rules: ruleGroupSchema.optional(),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
  rules: ruleGroupSchema.optional(),
});

const bulkAddDevicesSchema = z.object({
  device_ids: z.array(z.string().uuid()).min(1).max(500),
});

async function getGroupDepth(parentId: string | null): Promise<number> {
  if (!parentId) return 0;
  const [parent] = await db.select({ depth: deviceGroups.depth }).from(deviceGroups).where(eq(deviceGroups.id, parentId)).limit(1);
  if (!parent) return 0;
  return parent.depth + 1;
}

interface GroupNode {
  id: string;
  name: string;
  description: string | null;
  type: string;
  memberCount: number;
  parentId: string | null;
  depth: number;
  children: GroupNode[];
}

function buildTree(groups: any[], memberCounts: Map<string, number>): GroupNode[] {
  const nodeMap = new Map<string, GroupNode>();
  const roots: GroupNode[] = [];

  for (const g of groups) {
    nodeMap.set(g.id, {
      id: g.id,
      name: g.name,
      description: g.description,
      type: g.type,
      memberCount: memberCounts.get(g.id) ?? 0,
      parentId: g.parentId,
      depth: g.depth,
      children: [],
    });
  }

  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function groupRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // List device groups with member count
  app.get('/', {
    schema: { description: 'List device groups', tags: ['groups'] },
    preHandler: [requirePermission('groups:read')],
  }, async (request, reply) => {
    const { page = 1, limit = 25 } = request.query as { page?: number; limit?: number };
    const offset = (Number(page) - 1) * Number(limit);
    const where = eq(deviceGroups.orgId, request.user.orgId);

    const [data, [{ total }]] = await Promise.all([
      db.select().from(deviceGroups).where(where).orderBy(desc(deviceGroups.createdAt)).limit(Number(limit)).offset(offset),
      db.select({ total: count() }).from(deviceGroups).where(where),
    ]);

    // Get member counts
    const groupIds = data.map(g => g.id);
    const memberCounts = groupIds.length > 0
      ? await db.select({
          groupId: deviceGroupMembers.groupId,
          count: count(),
        }).from(deviceGroupMembers)
          .where(inArray(deviceGroupMembers.groupId, groupIds))
          .groupBy(deviceGroupMembers.groupId)
      : [];

    const countMap = new Map(memberCounts.map(m => [m.groupId, m.count]));

    const enriched = data.map(g => ({
      ...g,
      memberCount: countMap.get(g.id) ?? 0,
    }));

    reply.send({ data: enriched, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
  });

  // Get hierarchical tree
  app.get('/tree', {
    schema: { description: 'Get device groups as hierarchical tree', tags: ['groups'] },
    preHandler: [requirePermission('groups:read')],
  }, async (request, reply) => {
    const allGroups = await db.select().from(deviceGroups)
      .where(eq(deviceGroups.orgId, request.user.orgId))
      .orderBy(deviceGroups.depth, deviceGroups.name);

    const groupIds = allGroups.map(g => g.id);
    const memberCounts = groupIds.length > 0
      ? await db.select({
          groupId: deviceGroupMembers.groupId,
          count: count(),
        }).from(deviceGroupMembers)
          .where(inArray(deviceGroupMembers.groupId, groupIds))
          .groupBy(deviceGroupMembers.groupId)
      : [];

    const countMap = new Map(memberCounts.map(m => [m.groupId, m.count]));
    const tree = buildTree(allGroups, countMap);

    reply.send({ data: tree });
  });

  // Create device group
  app.post('/', {
    schema: { description: 'Create a device group', tags: ['groups'] },
    preHandler: [requirePermission('groups:write')],
  }, async (request, reply) => {
    const body = createGroupSchema.parse(request.body);

    // Validate parent depth
    const depth = await getGroupDepth(body.parentId ?? null);
    if (depth >= MAX_GROUP_DEPTH) {
      reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: `Maximum group nesting depth is ${MAX_GROUP_DEPTH}` });
      return;
    }

    const isDynamic = body.type === 'dynamic';

    const [group] = await db.insert(deviceGroups).values({
      name: body.name,
      description: body.description,
      type: body.type as any,
      isDynamic,
      parentId: body.parentId ?? null,
      rules: body.rules ?? null,
      dynamicFilter: body.rules ?? null,
      depth,
      orgId: request.user.orgId,
    }).returning();

    await db.insert(auditLogs).values({
      orgId: request.user.orgId,
      userId: request.user.sub,
      action: 'group.created',
      resource: 'group',
      resourceId: group.id,
      details: { type: body.type, parentId: body.parentId },
    });

    // If dynamic, immediately evaluate membership
    if (isDynamic && body.rules) {
      await dynamicGroupService.evaluateMembership(group.id);
    }

    reply.status(201).send(group);
  });

  // Get group by ID
  app.get('/:id', {
    schema: { description: 'Get device group by ID', tags: ['groups'] },
    preHandler: [requirePermission('groups:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [group] = await db.select().from(deviceGroups)
      .where(and(eq(deviceGroups.id, id), eq(deviceGroups.orgId, request.user.orgId)))
      .limit(1);

    if (!group) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Group not found' });
      return;
    }

    // Get member count
    const [{ memberCount }] = await db.select({ memberCount: count() })
      .from(deviceGroupMembers)
      .where(eq(deviceGroupMembers.groupId, id));

    // Get child groups
    const children = await db.select({ id: deviceGroups.id, name: deviceGroups.name, type: deviceGroups.type })
      .from(deviceGroups)
      .where(and(eq(deviceGroups.parentId, id), eq(deviceGroups.orgId, request.user.orgId)));

    reply.send({ ...group, memberCount, children });
  });

  // Update group
  app.patch('/:id', {
    schema: { description: 'Update a device group', tags: ['groups'] },
    preHandler: [requirePermission('groups:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateGroupSchema.parse(request.body);

    // If changing parent, validate depth
    if (body.parentId !== undefined) {
      const newDepth = await getGroupDepth(body.parentId);
      if (newDepth >= MAX_GROUP_DEPTH) {
        reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: `Maximum group nesting depth is ${MAX_GROUP_DEPTH}` });
        return;
      }
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.parentId !== undefined) {
      updateData.parentId = body.parentId;
      updateData.depth = await getGroupDepth(body.parentId);
    }
    if (body.rules !== undefined) {
      updateData.rules = body.rules;
      updateData.dynamicFilter = body.rules;
    }

    const [group] = await db.update(deviceGroups)
      .set(updateData)
      .where(and(eq(deviceGroups.id, id), eq(deviceGroups.orgId, request.user.orgId)))
      .returning();

    if (!group) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Group not found' });
      return;
    }

    // Re-evaluate if dynamic and rules changed
    if (group.type === 'dynamic' && body.rules) {
      await dynamicGroupService.evaluateMembership(group.id);
    }

    reply.send(group);
  });

  // Delete group
  app.delete('/:id', {
    schema: { description: 'Delete a device group', tags: ['groups'] },
    preHandler: [requirePermission('groups:delete')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Check for policy assignments
    const assignedPolicies = await db.select({ id: policyAssignments.id })
      .from(policyAssignments)
      .where(eq(policyAssignments.groupId, id));

    // Warn in response if policies are assigned
    const warnings: string[] = [];
    if (assignedPolicies.length > 0) {
      warnings.push(`${assignedPolicies.length} policy assignment(s) will be removed`);
      // Clean up policy assignments
      await db.delete(policyAssignments).where(eq(policyAssignments.groupId, id));
    }

    // Remove memberships (cascade should handle, but be explicit)
    await db.delete(deviceGroupMembers).where(eq(deviceGroupMembers.groupId, id));

    // Reparent child groups to parent of deleted group
    const [group] = await db.select({ parentId: deviceGroups.parentId })
      .from(deviceGroups)
      .where(and(eq(deviceGroups.id, id), eq(deviceGroups.orgId, request.user.orgId)))
      .limit(1);

    if (group) {
      await db.update(deviceGroups)
        .set({ parentId: group.parentId, depth: group.parentId ? undefined as any : 0 })
        .where(eq(deviceGroups.parentId, id));
    }

    await db.delete(deviceGroups).where(and(eq(deviceGroups.id, id), eq(deviceGroups.orgId, request.user.orgId)));

    await db.insert(auditLogs).values({
      orgId: request.user.orgId,
      userId: request.user.sub,
      action: 'group.deleted',
      resource: 'group',
      resourceId: id,
    });

    reply.status(200).send({ message: 'Group deleted', warnings });
  });

  // Bulk add devices to static group
  app.post('/:id/devices', {
    schema: { description: 'Add devices to a static group', tags: ['groups'] },
    preHandler: [requirePermission('groups:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = bulkAddDevicesSchema.parse(request.body);

    // Verify group exists and is static
    const [group] = await db.select().from(deviceGroups)
      .where(and(eq(deviceGroups.id, id), eq(deviceGroups.orgId, request.user.orgId)))
      .limit(1);

    if (!group) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Group not found' });
      return;
    }

    if (group.type === 'dynamic') {
      reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Cannot manually add devices to a dynamic group' });
      return;
    }

    const values = body.device_ids.map(deviceId => ({ groupId: id, deviceId }));
    const added = await db.insert(deviceGroupMembers).values(values).onConflictDoNothing().returning();

    await db.insert(auditLogs).values({
      orgId: request.user.orgId,
      userId: request.user.sub,
      action: 'group.devices.added',
      resource: 'group',
      resourceId: id,
      details: { deviceCount: added.length },
    });

    reply.status(201).send({ added: added.length });
  });

  // Remove device from group
  app.delete('/:id/devices/:deviceId', {
    schema: { description: 'Remove a device from a group', tags: ['groups'] },
    preHandler: [requirePermission('groups:write')],
  }, async (request, reply) => {
    const { id, deviceId } = request.params as { id: string; deviceId: string };

    // Verify group is not dynamic
    const [group] = await db.select({ type: deviceGroups.type }).from(deviceGroups)
      .where(and(eq(deviceGroups.id, id), eq(deviceGroups.orgId, request.user.orgId)))
      .limit(1);

    if (group?.type === 'dynamic') {
      reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Cannot manually remove devices from a dynamic group' });
      return;
    }

    await db.delete(deviceGroupMembers).where(
      and(eq(deviceGroupMembers.groupId, id), eq(deviceGroupMembers.deviceId, deviceId))
    );

    reply.status(204).send();
  });

  // Get group members (devices)
  app.get('/:id/members', {
    schema: { description: 'List devices in a group', tags: ['groups'] },
    preHandler: [requirePermission('groups:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { page = 1, limit = 25 } = request.query as { page?: number; limit?: number };
    const offset = (Number(page) - 1) * Number(limit);

    const members = await db.execute(
      sql`SELECT d.id, d.name, d.platform, d.os_version, d.model, d.status, d.compliance_status, d.last_seen_at,
              dgm.created_at as joined_at
          FROM device_group_members dgm
          JOIN devices d ON d.id = dgm.device_id
          WHERE dgm.group_id = ${id}
          ORDER BY dgm.created_at DESC
          LIMIT ${Number(limit)} OFFSET ${offset}`
    );

    const [{ total }] = await db.select({ total: count() })
      .from(deviceGroupMembers)
      .where(eq(deviceGroupMembers.groupId, id));

    reply.send({ data: members, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
  });

  // Re-evaluate dynamic group
  app.post('/:id/evaluate', {
    schema: { description: 'Re-evaluate dynamic group membership', tags: ['groups'] },
    preHandler: [requirePermission('groups:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [group] = await db.select().from(deviceGroups)
      .where(and(eq(deviceGroups.id, id), eq(deviceGroups.orgId, request.user.orgId)))
      .limit(1);

    if (!group) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Group not found' });
      return;
    }

    if (group.type !== 'dynamic') {
      reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Only dynamic groups can be re-evaluated' });
      return;
    }

    const result = await dynamicGroupService.evaluateMembership(id);
    reply.send({ message: 'Evaluation complete', ...result });
  });

  // Preview dynamic rules
  app.post('/preview-rules', {
    schema: { description: 'Preview devices matching dynamic rules', tags: ['groups'] },
    preHandler: [requirePermission('groups:read')],
  }, async (request, reply) => {
    const body = ruleGroupSchema.parse(request.body);
    const result = await dynamicGroupService.previewRules(request.user.orgId, body as RuleGroup);
    reply.send(result);
  });

  // Get group policies
  app.get('/:id/policies', {
    schema: { description: 'List policies assigned to a group', tags: ['groups'] },
    preHandler: [requirePermission('groups:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const groupPolicies = await db
      .select({
        assignmentId: policyAssignments.id,
        policyId: policies.id,
        policyName: policies.name,
        platform: policies.platform,
        version: policies.version,
        assignedAt: policyAssignments.createdAt,
      })
      .from(policyAssignments)
      .innerJoin(policies, eq(policyAssignments.policyId, policies.id))
      .where(eq(policyAssignments.groupId, id));

    // Also get inherited policies from parent groups
    const [group] = await db.select({ parentId: deviceGroups.parentId })
      .from(deviceGroups)
      .where(eq(deviceGroups.id, id))
      .limit(1);

    let inheritedPolicies: typeof groupPolicies = [];
    if (group?.parentId) {
      inheritedPolicies = await db
        .select({
          assignmentId: policyAssignments.id,
          policyId: policies.id,
          policyName: policies.name,
          platform: policies.platform,
          version: policies.version,
          assignedAt: policyAssignments.createdAt,
        })
        .from(policyAssignments)
        .innerJoin(policies, eq(policyAssignments.policyId, policies.id))
        .where(eq(policyAssignments.groupId, group.parentId));
    }

    reply.send({
      data: groupPolicies,
      inherited: inheritedPolicies,
    });
  });

  // Assign policy to group
  app.post('/:id/policies', {
    schema: { description: 'Assign a policy to a group', tags: ['groups'] },
    preHandler: [requirePermission('groups:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { policyId } = z.object({ policyId: z.string().uuid() }).parse(request.body);

    const [assignment] = await db.insert(policyAssignments)
      .values({ policyId, groupId: id })
      .returning();

    await db.insert(auditLogs).values({
      orgId: request.user.orgId,
      userId: request.user.sub,
      action: 'group.policy.assigned',
      resource: 'group',
      resourceId: id,
      details: { policyId },
    });

    reply.status(201).send(assignment);
  });

  // Legacy member endpoints for backwards compatibility
  app.post('/:id/members', {
    schema: { description: 'Add a device to a group (legacy)', tags: ['groups'] },
    preHandler: [requirePermission('groups:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { deviceId } = z.object({ deviceId: z.string().uuid() }).parse(request.body);
    const [member] = await db.insert(deviceGroupMembers).values({ groupId: id, deviceId }).returning();
    reply.status(201).send(member);
  });

  app.delete('/:id/members/:deviceId', {
    schema: { description: 'Remove a device from a group (legacy)', tags: ['groups'] },
    preHandler: [requirePermission('groups:write')],
  }, async (request, reply) => {
    const { id, deviceId } = request.params as { id: string; deviceId: string };
    await db.delete(deviceGroupMembers).where(and(eq(deviceGroupMembers.groupId, id), eq(deviceGroupMembers.deviceId, deviceId)));
    reply.status(204).send();
  });
}
