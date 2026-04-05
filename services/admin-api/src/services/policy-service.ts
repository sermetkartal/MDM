import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  policies,
  policyVersions,
  policyAssignments,
  auditLogs,
} from '../db/schema.js';
import type { PaginationQuery, PaginatedResponse } from '../types/index.js';

export class PolicyService {
  async list(orgId: string, query: PaginationQuery): Promise<PaginatedResponse<typeof policies.$inferSelect>> {
    const { page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const offset = (page - 1) * limit;

    const where = eq(policies.orgId, orgId);
    const orderFn = sortOrder === 'asc' ? (await import('drizzle-orm')).asc : desc;
    const orderCol = (policies as any)[sortBy] ?? policies.createdAt;

    const [data, [{ total }]] = await Promise.all([
      db.select().from(policies).where(where).orderBy(orderFn(orderCol)).limit(limit).offset(offset),
      db.select({ total: count() }).from(policies).where(where),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(orgId: string, policyId: string) {
    const [policy] = await db
      .select()
      .from(policies)
      .where(and(eq(policies.id, policyId), eq(policies.orgId, orgId)))
      .limit(1);

    if (!policy) {
      throw Object.assign(new Error('Policy not found'), { statusCode: 404 });
    }
    return policy;
  }

  async create(orgId: string, data: { name: string; description?: string; platform: string; payload: unknown }, userId: string) {
    const [policy] = await db
      .insert(policies)
      .values({
        orgId,
        name: data.name,
        description: data.description,
        platform: data.platform as any,
        payload: data.payload,
        version: 1,
      })
      .returning();

    // Create initial version snapshot
    await db.insert(policyVersions).values({
      policyId: policy.id,
      version: 1,
      payload: data.payload as any,
      createdBy: userId,
    });

    await db.insert(auditLogs).values({
      orgId,
      userId,
      action: 'policy.created',
      resource: 'policy',
      resourceId: policy.id,
      details: { name: data.name },
    });

    return policy;
  }

  async update(orgId: string, policyId: string, data: Partial<{ name: string; description: string; payload: unknown; isActive: boolean }>, userId: string) {
    const existing = await this.getById(orgId, policyId);

    const newVersion = data.payload ? existing.version + 1 : existing.version;
    const updates: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (data.payload) {
      updates.version = newVersion;
    }

    const [updated] = await db
      .update(policies)
      .set(updates)
      .where(and(eq(policies.id, policyId), eq(policies.orgId, orgId)))
      .returning();

    // Snapshot new version if payload changed
    if (data.payload) {
      await db.insert(policyVersions).values({
        policyId,
        version: newVersion,
        payload: data.payload as any,
        createdBy: userId,
      });
    }

    await db.insert(auditLogs).values({
      orgId,
      userId,
      action: 'policy.updated',
      resource: 'policy',
      resourceId: policyId,
      details: { changes: Object.keys(data) },
    });

    return updated;
  }

  async delete(orgId: string, policyId: string, userId: string) {
    await this.getById(orgId, policyId);

    await db.delete(policies).where(and(eq(policies.id, policyId), eq(policies.orgId, orgId)));

    await db.insert(auditLogs).values({
      orgId,
      userId,
      action: 'policy.deleted',
      resource: 'policy',
      resourceId: policyId,
    });
  }

  async getVersions(orgId: string, policyId: string) {
    await this.getById(orgId, policyId);
    return db
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.policyId, policyId))
      .orderBy(desc(policyVersions.version));
  }

  async createAssignment(orgId: string, policyId: string, data: { deviceId?: string; groupId?: string }, userId: string) {
    await this.getById(orgId, policyId);

    if (!data.deviceId && !data.groupId) {
      throw Object.assign(new Error('Either deviceId or groupId is required'), { statusCode: 400 });
    }

    const [assignment] = await db
      .insert(policyAssignments)
      .values({
        policyId,
        deviceId: data.deviceId,
        groupId: data.groupId,
      })
      .returning();

    await db.insert(auditLogs).values({
      orgId,
      userId,
      action: 'policy.assigned',
      resource: 'policy',
      resourceId: policyId,
      details: { deviceId: data.deviceId, groupId: data.groupId },
    });

    return assignment;
  }
}

export const policyService = new PolicyService();
