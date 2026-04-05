import { eq, and, sql, ilike, desc, asc, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  devices,
  commands,
  policyAssignments,
  policies,
  appAssignments,
  apps,
  complianceViolations,
  complianceRules,
  auditLogs,
} from '../db/schema.js';
import type { PaginationQuery, PaginatedResponse } from '../types/index.js';

interface DeviceFilters extends PaginationQuery {
  status?: string;
  platform?: string;
  search?: string;
  complianceStatus?: string;
}

export class DeviceService {
  async list(orgId: string, filters: DeviceFilters): Promise<PaginatedResponse<typeof devices.$inferSelect>> {
    const { page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', status, platform, search, complianceStatus } = filters;
    const offset = (page - 1) * limit;

    const conditions = [eq(devices.orgId, orgId)];
    if (status) conditions.push(eq(devices.status, status as any));
    if (platform) conditions.push(eq(devices.platform, platform as any));
    if (complianceStatus) conditions.push(eq(devices.complianceStatus, complianceStatus as any));
    if (search) conditions.push(ilike(devices.name, `%${search}%`));

    const where = and(...conditions);
    const orderFn = sortOrder === 'asc' ? asc : desc;
    const orderCol = (devices as any)[sortBy] ?? devices.createdAt;

    const [data, [{ total }]] = await Promise.all([
      db.select().from(devices).where(where).orderBy(orderFn(orderCol)).limit(limit).offset(offset),
      db.select({ total: count() }).from(devices).where(where),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(orgId: string, deviceId: string) {
    const [device] = await db
      .select()
      .from(devices)
      .where(and(eq(devices.id, deviceId), eq(devices.orgId, orgId)))
      .limit(1);

    if (!device) {
      throw Object.assign(new Error('Device not found'), { statusCode: 404 });
    }
    return device;
  }

  async getDevicePolicies(orgId: string, deviceId: string) {
    await this.getById(orgId, deviceId); // ensure device exists and belongs to org
    return db
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
      .where(eq(policyAssignments.deviceId, deviceId));
  }

  async getDeviceApps(orgId: string, deviceId: string) {
    await this.getById(orgId, deviceId);
    return db
      .select({
        assignmentId: appAssignments.id,
        appId: apps.id,
        appName: apps.name,
        bundleId: apps.bundleId,
        isRequired: appAssignments.isRequired,
        assignedAt: appAssignments.createdAt,
      })
      .from(appAssignments)
      .innerJoin(apps, eq(appAssignments.appId, apps.id))
      .where(eq(appAssignments.deviceId, deviceId));
  }

  async getDeviceCompliance(orgId: string, deviceId: string) {
    await this.getById(orgId, deviceId);
    return db
      .select({
        violationId: complianceViolations.id,
        ruleId: complianceRules.id,
        ruleName: complianceRules.name,
        severity: complianceRules.severity,
        details: complianceViolations.details,
        resolvedAt: complianceViolations.resolvedAt,
        createdAt: complianceViolations.createdAt,
      })
      .from(complianceViolations)
      .innerJoin(complianceRules, eq(complianceViolations.ruleId, complianceRules.id))
      .where(eq(complianceViolations.deviceId, deviceId));
  }

  async sendCommand(orgId: string, deviceId: string, type: string, payload: Record<string, unknown>, issuedBy: string) {
    await this.getById(orgId, deviceId);

    const [command] = await db
      .insert(commands)
      .values({
        orgId,
        deviceId,
        type,
        payload,
        issuedBy,
        status: 'pending',
      })
      .returning();

    // Audit log
    await db.insert(auditLogs).values({
      orgId,
      userId: issuedBy,
      action: 'command.sent',
      resource: 'device',
      resourceId: deviceId,
      details: { commandId: command.id, type },
    });

    return command;
  }
}

export const deviceService = new DeviceService();
