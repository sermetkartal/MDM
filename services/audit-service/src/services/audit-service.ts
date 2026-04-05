import { Pool } from 'pg';
import { config } from '../config/index.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });

export interface AuditEntry {
  id: string;
  org_id: string;
  actor: string;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string;
  detail: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: Date;
}

export interface AuditQueryFilters {
  org_id: string;
  actor_type?: string;
  actor_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  limit: number;
  offset: number;
}

export interface AuditWriteEntry {
  org_id: string;
  actor: string;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string;
  detail?: Record<string, unknown>;
  ip_address?: string;
}

export async function queryAuditLogs(filters: AuditQueryFilters): Promise<{ logs: AuditEntry[]; total: number }> {
  const conditions: string[] = ['org_id = $1'];
  const params: unknown[] = [filters.org_id];
  let idx = 2;

  if (filters.actor_type) { conditions.push(`actor_type = $${idx++}`); params.push(filters.actor_type); }
  if (filters.actor_id) { conditions.push(`actor = $${idx++}`); params.push(filters.actor_id); }
  if (filters.action) { conditions.push(`action ILIKE $${idx++}`); params.push(`%${filters.action}%`); }
  if (filters.resource_type) { conditions.push(`resource_type = $${idx++}`); params.push(filters.resource_type); }
  if (filters.resource_id) { conditions.push(`resource_id = $${idx++}`); params.push(filters.resource_id); }
  if (filters.from_date) { conditions.push(`created_at >= $${idx++}`); params.push(filters.from_date); }
  if (filters.to_date) { conditions.push(`created_at <= $${idx++}`); params.push(filters.to_date); }
  if (filters.search) {
    conditions.push(`(action ILIKE $${idx} OR detail::text ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const where = conditions.join(' AND ');

  const countResult = await pool.query(`SELECT COUNT(*) FROM audit_logs WHERE ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(filters.limit, filters.offset);
  const result = await pool.query(
    `SELECT * FROM audit_logs WHERE ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
    params,
  );

  return { logs: result.rows, total };
}

export async function getAuditLogDetail(id: string): Promise<AuditEntry | null> {
  const result = await pool.query('SELECT * FROM audit_logs WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function writeAuditEntry(entry: AuditWriteEntry): Promise<AuditEntry> {
  const result = await pool.query(
    `INSERT INTO audit_logs (id, org_id, actor, actor_type, action, resource_type, resource_id, detail, ip_address, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
    [entry.org_id, entry.actor, entry.actor_type, entry.action, entry.resource_type, entry.resource_id, JSON.stringify(entry.detail ?? {}), entry.ip_address ?? null],
  );
  return result.rows[0];
}

export async function batchWriteAuditEntries(entries: AuditWriteEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const values: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const entry of entries) {
    values.push(`(gen_random_uuid(), $${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7}, NOW())`);
    params.push(
      entry.org_id,
      entry.actor,
      entry.actor_type,
      entry.action,
      entry.resource_type,
      entry.resource_id,
      JSON.stringify(entry.detail ?? {}),
      entry.ip_address ?? null,
    );
    idx += 8;
  }

  await pool.query(
    `INSERT INTO audit_logs (id, org_id, actor, actor_type, action, resource_type, resource_id, detail, ip_address, created_at)
     VALUES ${values.join(', ')}`,
    params,
  );
}

export async function exportAuditLogs(filters: AuditQueryFilters): Promise<string> {
  const { logs } = await queryAuditLogs({ ...filters, limit: 50000, offset: 0 });

  const header = 'Timestamp,Actor,Actor Type,Action,Resource Type,Resource ID,IP Address,Detail\n';
  const rows = logs.map((log) => {
    const ts = log.created_at ? new Date(log.created_at).toISOString() : '';
    const detail = log.detail ? JSON.stringify(log.detail).replace(/"/g, '""') : '';
    return `"${ts}","${log.actor}","${log.actor_type}","${log.action}","${log.resource_type}","${log.resource_id}","${log.ip_address ?? ''}","${detail}"`;
  }).join('\n');

  return header + rows;
}

export async function ensureMonthlyPartition(): Promise<void> {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);

  const currentPartition = `audit_logs_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
  const nextPartition = `audit_logs_${nextMonth.getFullYear()}_${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

  for (const [name, start, end] of [
    [currentPartition, now, nextMonth],
    [nextPartition, nextMonth, monthAfter],
  ] as [string, Date, Date][]) {
    try {
      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-01`;
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF audit_logs FOR VALUES FROM ('${startStr}') TO ('${endStr}')`,
      );
    } catch {
      // Partition may already exist or table may not be partitioned
    }
  }
}
