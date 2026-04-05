import { Pool } from 'pg';
import { config } from '../config/index.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });

export interface Column {
  key: string;
  label: string;
  type?: 'string' | 'number' | 'date' | 'boolean';
}

export interface ReportData {
  title: string;
  generated_at: string;
  columns: Column[];
  rows: unknown[][];
  summary: Record<string, unknown>;
}

export interface ReportParams {
  from?: string;
  to?: string;
  filters?: Record<string, string>;
}

type ReportGenerator = (orgId: string, params: ReportParams) => Promise<ReportData>;

function dateFilter(from?: string, to?: string): { clause: string; values: unknown[]; idx: number } {
  const parts: string[] = [];
  const values: unknown[] = [];
  let idx = 2; // $1 is always orgId
  if (from) {
    idx++;
    parts.push(`created_at >= $${idx}`);
    values.push(from);
  }
  if (to) {
    idx++;
    parts.push(`created_at <= $${idx}`);
    values.push(to);
  }
  return { clause: parts.length ? ' AND ' + parts.join(' AND ') : '', values, idx };
}

export async function generateDeviceInventory(orgId: string, params: ReportParams): Promise<ReportData> {
  const dateArgs: unknown[] = [];
  let dateSql = '';
  if (params.from) {
    dateArgs.push(params.from);
    dateSql += ` AND d.enrolled_at >= $${dateArgs.length + 1}`;
  }
  if (params.to) {
    dateArgs.push(params.to);
    dateSql += ` AND d.enrolled_at <= $${dateArgs.length + 1}`;
  }

  const result = await pool.query(
    `SELECT d.serial_number, d.model, d.manufacturer, d.os_version, d.status,
            d.compliance_state, d.last_seen_at,
            COALESCE(
              (SELECT string_agg(g.name, ', ')
               FROM device_group_members dgm
               JOIN device_groups g ON g.id = dgm.group_id
               WHERE dgm.device_id = d.id), ''
            ) as groups,
            (SELECT COUNT(*) FROM policy_assignments pa WHERE pa.device_id = d.id)::int as policy_count
     FROM devices d WHERE d.org_id = $1${dateSql}
     ORDER BY d.enrolled_at DESC`,
    [orgId, ...dateArgs],
  );

  const columns: Column[] = [
    { key: 'serial_number', label: 'Serial', type: 'string' },
    { key: 'model', label: 'Model', type: 'string' },
    { key: 'manufacturer', label: 'Manufacturer', type: 'string' },
    { key: 'os_version', label: 'OS', type: 'string' },
    { key: 'status', label: 'Status', type: 'string' },
    { key: 'compliance_state', label: 'Compliance', type: 'string' },
    { key: 'last_seen_at', label: 'Last Seen', type: 'date' },
    { key: 'groups', label: 'Groups', type: 'string' },
    { key: 'policy_count', label: 'Policy Count', type: 'number' },
  ];

  const rows = result.rows.map(r => columns.map(c => r[c.key]));
  const enrolled = result.rows.filter(r => r.status === 'enrolled').length;
  const compliant = result.rows.filter(r => r.compliance_state === 'COMPLIANT').length;

  return {
    title: 'Device Inventory Report',
    generated_at: new Date().toISOString(),
    columns,
    rows,
    summary: {
      total_devices: result.rows.length,
      enrolled,
      compliant,
      non_compliant: result.rows.length - compliant,
    },
  };
}

export async function generateComplianceSummary(orgId: string, params: ReportParams): Promise<ReportData> {
  const dateArgs: unknown[] = [];
  let dateSql = '';
  if (params.from) {
    dateArgs.push(params.from);
    dateSql += ` AND cv.detected_at >= $${dateArgs.length + 1}`;
  }
  if (params.to) {
    dateArgs.push(params.to);
    dateSql += ` AND cv.detected_at <= $${dateArgs.length + 1}`;
  }

  // Violations by severity
  const severityResult = await pool.query(
    `SELECT cv.severity, COUNT(*)::int as count
     FROM compliance_violations cv
     JOIN devices d ON d.id = cv.device_id
     WHERE d.org_id = $1${dateSql}
     GROUP BY cv.severity ORDER BY count DESC`,
    [orgId, ...dateArgs],
  );

  // Violations by policy
  const policyResult = await pool.query(
    `SELECT cr.name as rule_name, cr.severity, COUNT(cv.id)::int as violation_count
     FROM compliance_violations cv
     JOIN compliance_rules cr ON cr.id = cv.rule_id
     JOIN devices d ON d.id = cv.device_id
     WHERE d.org_id = $1${dateSql}
     GROUP BY cr.id ORDER BY violation_count DESC`,
    [orgId, ...dateArgs],
  );

  // Daily trend
  const trendResult = await pool.query(
    `SELECT DATE(cv.detected_at) as date, COUNT(*)::int as count
     FROM compliance_violations cv
     JOIN devices d ON d.id = cv.device_id
     WHERE d.org_id = $1${dateSql}
     GROUP BY DATE(cv.detected_at) ORDER BY date`,
    [orgId, ...dateArgs],
  );

  const columns: Column[] = [
    { key: 'rule_name', label: 'Rule', type: 'string' },
    { key: 'severity', label: 'Severity', type: 'string' },
    { key: 'violation_count', label: 'Violations', type: 'number' },
  ];

  const rows = policyResult.rows.map(r => columns.map(c => r[c.key]));
  const totalViolations = severityResult.rows.reduce((s, r) => s + r.count, 0);

  return {
    title: 'Compliance Summary Report',
    generated_at: new Date().toISOString(),
    columns,
    rows,
    summary: {
      total_violations: totalViolations,
      by_severity: Object.fromEntries(severityResult.rows.map(r => [r.severity, r.count])),
      daily_trend: trendResult.rows,
    },
  };
}

export async function generateAppUsage(orgId: string, params: ReportParams): Promise<ReportData> {
  const result = await pool.query(
    `SELECT a.name as app_name, a.package_name,
            COUNT(DISTINCT dai.device_id)::int as installed_count,
            MAX(dai.version) as latest_version,
            CASE WHEN dt.total > 0
              THEN ROUND(COUNT(DISTINCT dai.device_id)::numeric / dt.total * 100, 1)
              ELSE 0
            END as adoption_pct,
            a.is_managed
     FROM apps a
     LEFT JOIN device_app_inventory dai ON dai.package_name = a.package_name
     LEFT JOIN devices d ON d.id = dai.device_id AND d.org_id = $1
     CROSS JOIN (SELECT COUNT(*)::numeric as total FROM devices WHERE org_id = $1 AND status = 'enrolled') dt
     WHERE a.org_id = $1
     GROUP BY a.id, a.name, a.package_name, a.is_managed, dt.total
     ORDER BY installed_count DESC`,
    [orgId],
  );

  const columns: Column[] = [
    { key: 'app_name', label: 'App Name', type: 'string' },
    { key: 'package_name', label: 'Package', type: 'string' },
    { key: 'installed_count', label: 'Installed Count', type: 'number' },
    { key: 'latest_version', label: 'Latest Version', type: 'string' },
    { key: 'adoption_pct', label: 'Adoption %', type: 'number' },
    { key: 'is_managed', label: 'Managed', type: 'boolean' },
  ];

  const rows = result.rows.map(r => columns.map(c => r[c.key]));
  const managed = result.rows.filter(r => r.is_managed).length;

  return {
    title: 'App Usage Report',
    generated_at: new Date().toISOString(),
    columns,
    rows,
    summary: {
      total_apps: result.rows.length,
      managed_apps: managed,
      unmanaged_apps: result.rows.length - managed,
    },
  };
}

export async function generateEnrollmentReport(orgId: string, params: ReportParams): Promise<ReportData> {
  const dateArgs: unknown[] = [];
  let dateSql = '';
  if (params.from) {
    dateArgs.push(params.from);
    dateSql += ` AND d.enrolled_at >= $${dateArgs.length + 1}`;
  }
  if (params.to) {
    dateArgs.push(params.to);
    dateSql += ` AND d.enrolled_at <= $${dateArgs.length + 1}`;
  }

  const result = await pool.query(
    `SELECT DATE(d.enrolled_at) as date,
            COALESCE(d.enrollment_method, 'manual') as method,
            COUNT(*)::int as count,
            ROUND(
              COUNT(*) FILTER (WHERE d.status != 'failed')::numeric /
              NULLIF(COUNT(*)::numeric, 0) * 100, 1
            ) as success_rate
     FROM devices d
     WHERE d.org_id = $1 AND d.enrolled_at IS NOT NULL${dateSql}
     GROUP BY DATE(d.enrolled_at), d.enrollment_method
     ORDER BY date DESC`,
    [orgId, ...dateArgs],
  );

  const columns: Column[] = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'method', label: 'Method', type: 'string' },
    { key: 'count', label: 'Count', type: 'number' },
    { key: 'success_rate', label: 'Success Rate', type: 'number' },
  ];

  const rows = result.rows.map(r => columns.map(c => r[c.key]));
  const totalEnrollments = result.rows.reduce((s, r) => s + r.count, 0);

  return {
    title: 'Enrollment Report',
    generated_at: new Date().toISOString(),
    columns,
    rows,
    summary: {
      total_enrollments: totalEnrollments,
      by_method: result.rows.reduce((acc, r) => {
        acc[r.method] = (acc[r.method] ?? 0) + r.count;
        return acc;
      }, {} as Record<string, number>),
    },
  };
}

export async function generateSecurityAudit(orgId: string, params: ReportParams): Promise<ReportData> {
  const dateArgs: unknown[] = [];
  let dateSql = '';
  if (params.from) {
    dateArgs.push(params.from);
    dateSql += ` AND al.created_at >= $${dateArgs.length + 1}`;
  }
  if (params.to) {
    dateArgs.push(params.to);
    dateSql += ` AND al.created_at <= $${dateArgs.length + 1}`;
  }

  const securityActions = [
    'device.wipe', 'device.lock', 'device.block',
    'policy.create', 'policy.update', 'policy.delete',
    'compliance.violation_detected', 'compliance.remediation',
    'auth.login_failed', 'auth.password_reset',
    'admin.role_change', 'admin.user_create', 'admin.user_delete',
  ];

  const result = await pool.query(
    `SELECT al.created_at as timestamp, al.action, al.actor_email,
            al.resource_type, al.resource_id, al.details
     FROM audit_logs al
     WHERE al.org_id = $1 AND al.action = ANY($2)${dateSql}
     ORDER BY al.created_at DESC
     LIMIT 5000`,
    [orgId, securityActions, ...dateArgs],
  );

  const columns: Column[] = [
    { key: 'timestamp', label: 'Timestamp', type: 'date' },
    { key: 'action', label: 'Action', type: 'string' },
    { key: 'actor_email', label: 'Actor', type: 'string' },
    { key: 'resource_type', label: 'Resource Type', type: 'string' },
    { key: 'resource_id', label: 'Resource ID', type: 'string' },
    { key: 'details', label: 'Details', type: 'string' },
  ];

  const rows = result.rows.map(r => columns.map(c =>
    c.key === 'details' ? JSON.stringify(r[c.key]) : r[c.key]
  ));

  const actionCounts = result.rows.reduce((acc, r) => {
    acc[r.action] = (acc[r.action] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    title: 'Security Audit Report',
    generated_at: new Date().toISOString(),
    columns,
    rows,
    summary: {
      total_events: result.rows.length,
      by_action: actionCounts,
    },
  };
}

const generators: Record<string, ReportGenerator> = {
  device_inventory: generateDeviceInventory,
  compliance_summary: generateComplianceSummary,
  app_usage: generateAppUsage,
  enrollment: generateEnrollmentReport,
  security_audit: generateSecurityAudit,
};

export async function generateReport(templateId: string, orgId: string, params: ReportParams = {}): Promise<ReportData> {
  const generator = generators[templateId];
  if (!generator) throw new Error(`Unknown report template: ${templateId}`);
  return generator(orgId, params);
}
