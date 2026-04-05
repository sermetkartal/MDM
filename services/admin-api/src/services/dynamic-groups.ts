import { eq, and, sql, inArray, notInArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  devices,
  deviceGroups,
  deviceGroupMembers,
  policyAssignments,
  auditLogs,
} from '../db/schema.js';

// --- Rule Types ---

export interface RuleCondition {
  field: string;
  op: string;
  value: string | string[];
}

export interface RuleGroup {
  operator: 'and' | 'or';
  conditions: (RuleCondition | RuleGroup)[];
}

const ALLOWED_FIELDS = [
  'os_version',
  'model',
  'manufacturer',
  'platform',
  'status',
  'compliance_status',
  'os_type',
  'enrollment_status',
  'agent_version',
  'last_seen_at',
] as const;

const FIELD_COLUMN_MAP: Record<string, string> = {
  os_version: 'os_version',
  model: 'model',
  manufacturer: 'manufacturer',
  platform: 'platform',
  os_type: 'platform',
  status: 'status',
  enrollment_status: 'status',
  compliance_status: 'compliance_status',
  compliance_state: 'compliance_status',
  agent_version: "device_info->>'agent_version'",
  last_seen_at: 'last_seen_at',
};

const ALLOWED_OPS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'contains', 'not_contains', 'starts_with',
  'in', 'regex',
] as const;

// --- SQL Condition Builder ---

function buildConditionSQL(condition: RuleCondition): string {
  const column = FIELD_COLUMN_MAP[condition.field];
  if (!column) throw new Error(`Unknown field: ${condition.field}`);

  const value = typeof condition.value === 'string'
    ? condition.value.replace(/'/g, "''")
    : '';

  // Handle relative time for last_seen_at
  if (condition.field === 'last_seen_at' && typeof condition.value === 'string') {
    const match = condition.value.match(/^(\d+)([dhm])$/);
    if (match) {
      const [, num, unit] = match;
      const intervalUnit = unit === 'd' ? 'days' : unit === 'h' ? 'hours' : 'minutes';
      const interval = `${num} ${intervalUnit}`;
      switch (condition.op) {
        case 'gt':
        case 'lt':
          return `${column} > NOW() - INTERVAL '${interval}'`;
        case 'gte':
        case 'lte':
          return `${column} <= NOW() - INTERVAL '${interval}'`;
        default:
          return `${column} > NOW() - INTERVAL '${interval}'`;
      }
    }
  }

  switch (condition.op) {
    case 'eq':
      return `${column} = '${value}'`;
    case 'neq':
      return `${column} != '${value}'`;
    case 'gt':
      return `${column} > '${value}'`;
    case 'gte':
      return `${column} >= '${value}'`;
    case 'lt':
      return `${column} < '${value}'`;
    case 'lte':
      return `${column} <= '${value}'`;
    case 'contains':
      return `${column} ILIKE '%${value}%'`;
    case 'not_contains':
      return `${column} NOT ILIKE '%${value}%'`;
    case 'starts_with':
      return `${column} ILIKE '${value}%'`;
    case 'in': {
      const values = Array.isArray(condition.value)
        ? condition.value
        : condition.value.split(',').map(v => v.trim());
      const escaped = values.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
      return `${column} IN (${escaped})`;
    }
    case 'regex':
      return `${column} ~ '${value}'`;
    default:
      throw new Error(`Unknown operator: ${condition.op}`);
  }
}

function buildRuleSQL(rule: RuleGroup | RuleCondition): string {
  if ('operator' in rule) {
    const joiner = rule.operator === 'and' ? ' AND ' : ' OR ';
    const parts = rule.conditions.map(c => buildRuleSQL(c));
    return `(${parts.join(joiner)})`;
  }
  return buildConditionSQL(rule);
}

// --- Dynamic Group Service ---

export class DynamicGroupService {
  /**
   * Evaluate membership for a dynamic group: find matching devices and update memberships.
   */
  async evaluateMembership(groupId: string): Promise<{ added: number; removed: number }> {
    const [group] = await db
      .select()
      .from(deviceGroups)
      .where(eq(deviceGroups.id, groupId))
      .limit(1);

    if (!group || group.type !== 'dynamic' || !group.rules) {
      return { added: 0, removed: 0 };
    }

    const rules = group.rules as RuleGroup;
    const whereClause = buildRuleSQL(rules);

    // Find matching device IDs
    const matchingDevices: { id: string }[] = await db.execute(
      sql.raw(`SELECT id FROM devices WHERE org_id = '${group.orgId}' AND ${whereClause}`)
    ) as any;

    const matchingIds = matchingDevices.map(d => d.id);

    // Get current members
    const currentMembers = await db
      .select({ deviceId: deviceGroupMembers.deviceId })
      .from(deviceGroupMembers)
      .where(eq(deviceGroupMembers.groupId, groupId));

    const currentIds = new Set(currentMembers.map(m => m.deviceId));
    const matchingSet = new Set(matchingIds);

    // Devices to add (in matching but not in current)
    const toAdd = matchingIds.filter(id => !currentIds.has(id));
    // Devices to remove (in current but not in matching)
    const toRemove = [...currentIds].filter(id => !matchingSet.has(id));

    // Add new members
    if (toAdd.length > 0) {
      await db.insert(deviceGroupMembers).values(
        toAdd.map(deviceId => ({ groupId, deviceId }))
      ).onConflictDoNothing();

      // Trigger policy deployment for added devices
      await this.onDevicesAdded(groupId, group.orgId, toAdd);
    }

    // Remove non-matching members
    if (toRemove.length > 0) {
      await db.delete(deviceGroupMembers).where(
        and(
          eq(deviceGroupMembers.groupId, groupId),
          inArray(deviceGroupMembers.deviceId, toRemove)
        )
      );

      await this.onDevicesRemoved(groupId, group.orgId, toRemove);
    }

    // Update group timestamp
    await db.update(deviceGroups)
      .set({ updatedAt: new Date() })
      .where(eq(deviceGroups.id, groupId));

    return { added: toAdd.length, removed: toRemove.length };
  }

  /**
   * Evaluate all dynamic groups for a single device.
   */
  async evaluateDevice(deviceId: string): Promise<void> {
    // Get the device's org
    const [device] = await db
      .select({ orgId: devices.orgId })
      .from(devices)
      .where(eq(devices.id, deviceId))
      .limit(1);

    if (!device) return;

    // Get all dynamic groups in this org
    const dynamicGroups = await db
      .select()
      .from(deviceGroups)
      .where(and(
        eq(deviceGroups.orgId, device.orgId),
        eq(deviceGroups.type, 'dynamic')
      ));

    for (const group of dynamicGroups) {
      if (!group.rules) continue;

      const rules = group.rules as RuleGroup;
      const whereClause = buildRuleSQL(rules);

      // Check if this device matches
      const matches: { id: string }[] = await db.execute(
        sql.raw(`SELECT id FROM devices WHERE id = '${deviceId}' AND ${whereClause}`)
      ) as any;

      const isMatch = matches.length > 0;

      // Check current membership
      const [existing] = await db
        .select()
        .from(deviceGroupMembers)
        .where(and(
          eq(deviceGroupMembers.groupId, group.id),
          eq(deviceGroupMembers.deviceId, deviceId)
        ))
        .limit(1);

      if (isMatch && !existing) {
        await db.insert(deviceGroupMembers)
          .values({ groupId: group.id, deviceId })
          .onConflictDoNothing();
        await this.onDevicesAdded(group.id, device.orgId, [deviceId]);
      } else if (!isMatch && existing) {
        await db.delete(deviceGroupMembers).where(
          and(
            eq(deviceGroupMembers.groupId, group.id),
            eq(deviceGroupMembers.deviceId, deviceId)
          )
        );
        await this.onDevicesRemoved(group.id, device.orgId, [deviceId]);
      }
    }
  }

  /**
   * Preview how many devices match the given rules (without persisting).
   */
  async previewRules(orgId: string, rules: RuleGroup): Promise<{ count: number; deviceIds: string[] }> {
    const whereClause = buildRuleSQL(rules);

    const matchingDevices: { id: string }[] = await db.execute(
      sql.raw(`SELECT id FROM devices WHERE org_id = '${orgId}' AND ${whereClause} LIMIT 100`)
    ) as any;

    const countResult: { total: string }[] = await db.execute(
      sql.raw(`SELECT COUNT(*)::text as total FROM devices WHERE org_id = '${orgId}' AND ${whereClause}`)
    ) as any;

    return {
      count: parseInt(countResult[0]?.total ?? '0', 10),
      deviceIds: matchingDevices.map(d => d.id),
    };
  }

  /**
   * Handle devices added to a group -- deploy group policies.
   */
  private async onDevicesAdded(groupId: string, orgId: string, deviceIds: string[]): Promise<void> {
    // Fetch policies assigned to this group
    const groupPolicies = await db
      .select({ policyId: policyAssignments.policyId })
      .from(policyAssignments)
      .where(eq(policyAssignments.groupId, groupId));

    if (groupPolicies.length === 0) return;

    // Log group membership change for audit
    await db.insert(auditLogs).values({
      orgId,
      action: 'group.membership.changed',
      resource: 'group',
      resourceId: groupId,
      details: { added: deviceIds.length, policyCount: groupPolicies.length },
    });

    // In production, we'd publish NATS "policy.deploy" messages here
    // For now, log the intent
  }

  /**
   * Handle devices removed from a group.
   */
  private async onDevicesRemoved(groupId: string, orgId: string, deviceIds: string[]): Promise<void> {
    await db.insert(auditLogs).values({
      orgId,
      action: 'group.membership.changed',
      resource: 'group',
      resourceId: groupId,
      details: { removed: deviceIds.length },
    });
  }
}

export const dynamicGroupService = new DynamicGroupService();
