import { Pool } from 'pg';
import { connect, NatsConnection, JSONCodec } from 'nats';
import { config } from '../config/index.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let natsConn: NatsConnection | null = null;
const jc = JSONCodec();

async function getNats(): Promise<NatsConnection> {
  if (!natsConn) {
    natsConn = await connect({ servers: config.NATS_URL });
  }
  return natsConn;
}

export interface App {
  id: string;
  name: string;
  package_name: string;
  description: string | null;
  icon_url: string | null;
  platform: string;
  type: string;
  is_public: boolean;
  org_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface AppVersion {
  id: string;
  app_id: string;
  version_code: number;
  version_name: string;
  file_url: string;
  file_hash: string;
  file_size: number;
  min_sdk_version: number | null;
  release_notes: string | null;
  is_current: boolean;
  created_at: Date;
}

export interface AppAssignment {
  id: string;
  app_id: string;
  target_type: string;
  target_id: string;
  install_type: string;
  created_at: Date;
}

export interface InstalledAppInfo {
  package_name: string;
  version_code: number;
  version_name: string;
  is_system: boolean;
}

// --- App CRUD ---

export async function listApps(orgId: string, limit: number, offset: number): Promise<{ apps: App[]; total: number }> {
  const countResult = await pool.query('SELECT COUNT(*) FROM apps WHERE org_id = $1', [orgId]);
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(
    'SELECT * FROM apps WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [orgId, limit, offset],
  );

  return { apps: result.rows, total };
}

export async function getApp(id: string): Promise<App | null> {
  const result = await pool.query('SELECT * FROM apps WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function createApp(data: {
  name: string;
  package_name: string;
  description?: string;
  platform: string;
  type?: string;
  is_public?: boolean;
  org_id: string;
}): Promise<App> {
  const result = await pool.query(
    `INSERT INTO apps (id, name, package_name, description, platform, type, is_public, org_id)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.name, data.package_name, data.description ?? null, data.platform, data.type ?? 'enterprise', data.is_public ?? false, data.org_id],
  );
  return result.rows[0];
}

export async function updateApp(id: string, data: Partial<Pick<App, 'name' | 'description' | 'is_public' | 'icon_url'>>): Promise<App | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
  if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description); }
  if (data.is_public !== undefined) { fields.push(`is_public = $${idx++}`); values.push(data.is_public); }
  if (data.icon_url !== undefined) { fields.push(`icon_url = $${idx++}`); values.push(data.icon_url); }

  if (fields.length === 0) return getApp(id);

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE apps SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return result.rows[0] ?? null;
}

export async function deleteApp(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM apps WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// --- Version management ---

export async function createVersion(appId: string, data: {
  version_code: number;
  version_name: string;
  file_url: string;
  file_hash: string;
  file_size: number;
  min_sdk_version?: number;
  release_notes?: string;
}): Promise<AppVersion> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Mark all existing versions as not current
    await client.query(
      'UPDATE app_versions SET is_current = false WHERE app_id = $1',
      [appId],
    );

    // Insert new version as current
    const result = await client.query(
      `INSERT INTO app_versions (id, app_id, version_code, version_name, file_url, file_hash, file_size, min_sdk_version, release_notes, is_current)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, true) RETURNING *`,
      [appId, data.version_code, data.version_name, data.file_url, data.file_hash, data.file_size, data.min_sdk_version ?? null, data.release_notes ?? null],
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function listVersions(appId: string): Promise<AppVersion[]> {
  const result = await pool.query(
    'SELECT * FROM app_versions WHERE app_id = $1 ORDER BY version_code DESC',
    [appId],
  );
  return result.rows;
}

export async function getVersion(appId: string, versionId: string): Promise<AppVersion | null> {
  const result = await pool.query(
    'SELECT * FROM app_versions WHERE id = $1 AND app_id = $2',
    [versionId, appId],
  );
  return result.rows[0] ?? null;
}

export async function rollbackVersion(appId: string, versionId: string): Promise<AppVersion | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify version exists
    const versionResult = await client.query(
      'SELECT * FROM app_versions WHERE id = $1 AND app_id = $2',
      [versionId, appId],
    );
    if (versionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    // Mark all versions as not current
    await client.query(
      'UPDATE app_versions SET is_current = false WHERE app_id = $1',
      [appId],
    );

    // Mark specified version as current
    const result = await client.query(
      'UPDATE app_versions SET is_current = true WHERE id = $1 AND app_id = $2 RETURNING *',
      [versionId, appId],
    );

    await client.query('COMMIT');
    return result.rows[0] ?? null;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function generateUploadUrl(appId: string, fileName: string): Promise<{ upload_url: string; file_url: string }> {
  // Generate a presigned-style URL for S3 upload. In production this would use AWS SDK.
  const fileKey = `apps/${appId}/${Date.now()}_${fileName}`;
  const endpoint = config.S3_ENDPOINT ?? `https://s3.${config.S3_REGION}.amazonaws.com`;
  const uploadUrl = `${endpoint}/${config.S3_BUCKET}/${fileKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=3600`;
  const fileUrl = `${endpoint}/${config.S3_BUCKET}/${fileKey}`;

  return { upload_url: uploadUrl, file_url: fileUrl };
}

// --- Assignments ---

export async function createAssignment(appId: string, data: {
  target_type: string;
  target_id: string;
  install_type: string;
}): Promise<AppAssignment> {
  const result = await pool.query(
    `INSERT INTO app_assignments (id, app_id, target_type, target_id, install_type)
     VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING *`,
    [appId, data.target_type, data.target_id, data.install_type],
  );

  const assignment = result.rows[0];

  // Publish NATS event based on install type
  try {
    const nc = await getNats();
    if (data.install_type === 'required') {
      nc.publish('app.assigned', jc.encode({
        app_id: appId,
        assignment_id: assignment.id,
        target_type: data.target_type,
        target_id: data.target_id,
        install_type: 'required',
        action: 'INSTALL_APP',
      }));
    } else if (data.install_type === 'prohibited') {
      nc.publish('app.assigned', jc.encode({
        app_id: appId,
        assignment_id: assignment.id,
        target_type: data.target_type,
        target_id: data.target_id,
        install_type: 'prohibited',
        action: 'UNINSTALL_APP',
      }));
    }
  } catch (e) {
    // Log but don't fail the assignment creation
    console.error('Failed to publish NATS event:', e);
  }

  return assignment;
}

export async function listAssignments(appId: string): Promise<AppAssignment[]> {
  const result = await pool.query(
    'SELECT * FROM app_assignments WHERE app_id = $1 ORDER BY created_at DESC',
    [appId],
  );
  return result.rows;
}

export async function deleteAssignment(appId: string, assignmentId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM app_assignments WHERE id = $1 AND app_id = $2',
    [assignmentId, appId],
  );
  return (result.rowCount ?? 0) > 0;
}

// --- Enterprise app store ---

export async function getStoreApps(deviceId?: string): Promise<App[]> {
  if (deviceId) {
    // Get apps assigned to this specific device or its groups
    const result = await pool.query(
      `SELECT DISTINCT a.* FROM apps a
       JOIN app_assignments aa ON aa.app_id = a.id
       WHERE (aa.target_type = 'device' AND aa.target_id = $1)
          OR (aa.target_type = 'group' AND aa.target_id IN (
            SELECT group_id FROM device_group_members WHERE device_id = $1
          ))
       ORDER BY a.name ASC`,
      [deviceId],
    );
    return result.rows;
  }

  // Return all public apps
  const result = await pool.query(
    'SELECT * FROM apps WHERE is_public = true ORDER BY name ASC',
  );
  return result.rows;
}

// --- Drift detection ---

export async function detectDrift(deviceId: string, installedApps: InstalledAppInfo[]): Promise<{ install: string[]; uninstall: string[] }> {
  const installedPackages = new Set(installedApps.map(a => a.package_name));

  // Get required assignments for this device
  const requiredResult = await pool.query(
    `SELECT DISTINCT a.package_name, a.id as app_id FROM apps a
     JOIN app_assignments aa ON aa.app_id = a.id
     WHERE aa.install_type = 'required'
       AND ((aa.target_type = 'device' AND aa.target_id = $1)
         OR (aa.target_type = 'group' AND aa.target_id IN (
           SELECT group_id FROM device_group_members WHERE device_id = $1
         )))`,
    [deviceId],
  );

  // Get prohibited assignments for this device
  const prohibitedResult = await pool.query(
    `SELECT DISTINCT a.package_name FROM apps a
     JOIN app_assignments aa ON aa.app_id = a.id
     WHERE aa.install_type = 'prohibited'
       AND ((aa.target_type = 'device' AND aa.target_id = $1)
         OR (aa.target_type = 'group' AND aa.target_id IN (
           SELECT group_id FROM device_group_members WHERE device_id = $1
         )))`,
    [deviceId],
  );

  // Required apps that are not installed -> need INSTALL_APP
  const install: string[] = [];
  for (const row of requiredResult.rows) {
    if (!installedPackages.has(row.package_name)) {
      install.push(row.app_id);
    }
  }

  // Prohibited apps that are installed -> need UNINSTALL_APP
  const uninstall: string[] = [];
  for (const row of prohibitedResult.rows) {
    if (installedPackages.has(row.package_name)) {
      uninstall.push(row.package_name);
    }
  }

  return { install, uninstall };
}

// --- NATS subscriber for assignment events ---

export async function startAssignmentSubscriber(): Promise<void> {
  try {
    const nc = await getNats();
    const sub = nc.subscribe('app.assigned');

    (async () => {
      for await (const msg of sub) {
        try {
          const event = jc.decode(msg.data) as {
            app_id: string;
            assignment_id: string;
            target_type: string;
            target_id: string;
            install_type: string;
            action: string;
          };

          // Resolve target devices
          let deviceIds: string[] = [];
          if (event.target_type === 'device') {
            deviceIds = [event.target_id];
          } else if (event.target_type === 'group') {
            const result = await pool.query(
              'SELECT device_id FROM device_group_members WHERE group_id = $1',
              [event.target_id],
            );
            deviceIds = result.rows.map(r => r.device_id);
          }

          // Get current version for install commands
          let downloadUrl: string | undefined;
          if (event.action === 'INSTALL_APP') {
            const versionResult = await pool.query(
              'SELECT file_url FROM app_versions WHERE app_id = $1 AND is_current = true LIMIT 1',
              [event.app_id],
            );
            if (versionResult.rows.length > 0) {
              downloadUrl = versionResult.rows[0].file_url;
            }
          }

          // Get app package name for uninstall
          let packageName: string | undefined;
          const appResult = await pool.query('SELECT package_name FROM apps WHERE id = $1', [event.app_id]);
          if (appResult.rows.length > 0) {
            packageName = appResult.rows[0].package_name;
          }

          // Publish command creation requests for each device
          for (const deviceId of deviceIds) {
            nc.publish('command.create', jc.encode({
              device_id: deviceId,
              command_type: event.action,
              payload: {
                app_id: event.app_id,
                package_name: packageName,
                download_url: downloadUrl,
              },
            }));
          }
        } catch (e) {
          console.error('Error processing app assignment event:', e);
        }
      }
    })();

    console.log('App assignment subscriber started');
  } catch (e) {
    console.error('Failed to start assignment subscriber:', e);
  }
}
