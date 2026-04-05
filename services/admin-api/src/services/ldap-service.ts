import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  users,
  deviceGroups,
  integrations,
  ldapSyncHistory,
  roles,
} from '../db/schema.js';

// --- LDAP Config Types ---

export interface LdapConfig {
  url: string; // ldaps://ad.example.com:636
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  userFilter: string; // e.g. (objectClass=person)
  groupFilter: string; // e.g. (objectClass=group)
  userMapping: {
    email: string; // e.g. sAMAccountName or mail
    firstName: string; // e.g. givenName
    lastName: string; // e.g. sn
    displayName: string; // e.g. displayName
  };
  groupMapping: {
    name: string; // e.g. cn
    description: string; // e.g. description
    memberAttribute: string; // e.g. member
  };
  syncIntervalMinutes: number;
}

export interface LdapTestResult {
  success: boolean;
  message: string;
  userCount?: number;
  groupCount?: number;
}

export interface LdapSyncResult {
  status: 'completed' | 'failed';
  usersSynced: number;
  groupsSynced: number;
  errors: string[];
}

// --- LDAP Entry Types ---

interface LdapEntry {
  dn: string;
  attributes: Record<string, string | string[]>;
}

// --- LDAP Service ---

export class LdapService {
  /**
   * Test LDAP connection and bind credentials.
   */
  async testConnection(config: LdapConfig): Promise<LdapTestResult> {
    try {
      // Dynamic import of ldapjs (optional dependency)
      const ldap = await import('ldapjs');

      return new Promise((resolve) => {
        const client = ldap.createClient({
          url: config.url,
          tlsOptions: { rejectUnauthorized: false },
          connectTimeout: 10000,
        });

        client.on('error', (err: Error) => {
          resolve({ success: false, message: `Connection error: ${err.message}` });
        });

        client.bind(config.bindDn, config.bindPassword, (bindErr: Error | null) => {
          if (bindErr) {
            client.destroy();
            resolve({ success: false, message: `Bind failed: ${bindErr.message}` });
            return;
          }

          // Try a search to count users and groups
          let userCount = 0;
          let groupCount = 0;

          const searchDone = (type: 'users' | 'groups') => new Promise<number>((resolveSearch) => {
            const filter = type === 'users' ? config.userFilter : config.groupFilter;
            client.search(config.baseDn, {
              filter,
              scope: 'sub',
              sizeLimit: 0,
              attributes: ['dn'],
            }, (searchErr: Error | null, res: any) => {
              if (searchErr) {
                resolveSearch(0);
                return;
              }
              let count = 0;
              res.on('searchEntry', () => { count++; });
              res.on('error', () => { resolveSearch(count); });
              res.on('end', () => { resolveSearch(count); });
            });
          });

          Promise.all([searchDone('users'), searchDone('groups')]).then(([uc, gc]) => {
            userCount = uc;
            groupCount = gc;
            client.unbind(() => {});
            resolve({
              success: true,
              message: `Connected successfully. Found ${userCount} users and ${groupCount} groups.`,
              userCount,
              groupCount,
            });
          });
        });
      });
    } catch (err: any) {
      return { success: false, message: `LDAP module not available: ${err.message}` };
    }
  }

  /**
   * Sync users from LDAP to MDM.
   */
  async syncUsers(orgId: string, config: LdapConfig): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      const ldap = await import('ldapjs');
      const entries = await this.searchLdap(ldap, config, config.userFilter, [
        config.userMapping.email,
        config.userMapping.firstName,
        config.userMapping.lastName,
        config.userMapping.displayName,
        'dn',
      ]);

      // Get default role for LDAP users
      const [defaultRole] = await db.select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.orgId, orgId), eq(roles.name, 'Viewer')))
        .limit(1);

      if (!defaultRole) {
        errors.push('No default "Viewer" role found for org');
        return { synced, errors };
      }

      for (const entry of entries) {
        try {
          const email = this.getAttr(entry, config.userMapping.email);
          if (!email) continue;

          const firstName = this.getAttr(entry, config.userMapping.firstName) || '';
          const lastName = this.getAttr(entry, config.userMapping.lastName) || '';

          // Upsert user
          const existing = await db.select({ id: users.id })
            .from(users)
            .where(and(eq(users.email, email), eq(users.orgId, orgId)))
            .limit(1);

          if (existing.length > 0) {
            await db.update(users)
              .set({ firstName, lastName, updatedAt: new Date() })
              .where(eq(users.id, existing[0].id));
          } else {
            await db.insert(users).values({
              orgId,
              email,
              firstName,
              lastName,
              roleId: defaultRole.id,
              passwordHash: 'ldap-auth', // LDAP users don't use local passwords
            });
          }
          synced++;
        } catch (err: any) {
          errors.push(`Failed to sync user ${entry.dn}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`LDAP user sync error: ${err.message}`);
    }

    return { synced, errors };
  }

  /**
   * Sync groups from LDAP to MDM device groups.
   */
  async syncGroups(orgId: string, config: LdapConfig): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      const ldap = await import('ldapjs');
      const entries = await this.searchLdap(ldap, config, config.groupFilter, [
        config.groupMapping.name,
        config.groupMapping.description,
        'dn',
      ]);

      for (const entry of entries) {
        try {
          const name = this.getAttr(entry, config.groupMapping.name);
          if (!name) continue;

          const description = this.getAttr(entry, config.groupMapping.description) || '';

          // Upsert group by ldapDn
          const existing = await db.select({ id: deviceGroups.id })
            .from(deviceGroups)
            .where(and(eq(deviceGroups.ldapDn, entry.dn), eq(deviceGroups.orgId, orgId)))
            .limit(1);

          if (existing.length > 0) {
            await db.update(deviceGroups)
              .set({ name, description, updatedAt: new Date() })
              .where(eq(deviceGroups.id, existing[0].id));
          } else {
            await db.insert(deviceGroups).values({
              orgId,
              name,
              description,
              type: 'ldap' as any,
              isDynamic: false,
              ldapDn: entry.dn,
              depth: 0,
            });
          }
          synced++;
        } catch (err: any) {
          errors.push(`Failed to sync group ${entry.dn}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`LDAP group sync error: ${err.message}`);
    }

    return { synced, errors };
  }

  /**
   * Full sync: users + groups + create history record.
   */
  async fullSync(integrationId: string, orgId: string, config: LdapConfig): Promise<LdapSyncResult> {
    // Create sync history record
    const [history] = await db.insert(ldapSyncHistory).values({
      integrationId,
      orgId,
      status: 'running',
    }).returning();

    const errors: string[] = [];
    let usersSynced = 0;
    let groupsSynced = 0;

    try {
      const userResult = await this.syncUsers(orgId, config);
      usersSynced = userResult.synced;
      errors.push(...userResult.errors);

      const groupResult = await this.syncGroups(orgId, config);
      groupsSynced = groupResult.synced;
      errors.push(...groupResult.errors);

      const status = errors.length > 0 ? 'completed' : 'completed';

      await db.update(ldapSyncHistory).set({
        status,
        usersSynced,
        groupsSynced,
        errors: errors.length > 0 ? errors : [],
        completedAt: new Date(),
      }).where(eq(ldapSyncHistory.id, history.id));

      // Update integration last sync time
      await db.update(integrations).set({
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(integrations.id, integrationId));

      return { status: 'completed', usersSynced, groupsSynced, errors };
    } catch (err: any) {
      await db.update(ldapSyncHistory).set({
        status: 'failed',
        errors: [...errors, err.message],
        completedAt: new Date(),
      }).where(eq(ldapSyncHistory.id, history.id));

      return { status: 'failed', usersSynced, groupsSynced, errors: [...errors, err.message] };
    }
  }

  // --- Private helpers ---

  private async searchLdap(
    ldap: any,
    config: LdapConfig,
    filter: string,
    attributes: string[],
  ): Promise<LdapEntry[]> {
    return new Promise((resolve, reject) => {
      const client = ldap.createClient({
        url: config.url,
        tlsOptions: { rejectUnauthorized: false },
        connectTimeout: 10000,
      });

      client.on('error', (err: Error) => reject(err));

      client.bind(config.bindDn, config.bindPassword, (bindErr: Error | null) => {
        if (bindErr) {
          client.destroy();
          reject(bindErr);
          return;
        }

        const entries: LdapEntry[] = [];

        client.search(config.baseDn, {
          filter,
          scope: 'sub',
          attributes,
        }, (searchErr: Error | null, res: any) => {
          if (searchErr) {
            client.unbind(() => {});
            reject(searchErr);
            return;
          }

          res.on('searchEntry', (entry: any) => {
            const attrs: Record<string, string | string[]> = {};
            if (entry.pojo?.attributes) {
              for (const attr of entry.pojo.attributes) {
                attrs[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
              }
            }
            entries.push({ dn: entry.pojo?.objectName ?? entry.dn?.toString() ?? '', attributes: attrs });
          });

          res.on('error', (err: Error) => {
            client.unbind(() => {});
            reject(err);
          });

          res.on('end', () => {
            client.unbind(() => {});
            resolve(entries);
          });
        });
      });
    });
  }

  private getAttr(entry: LdapEntry, attrName: string): string | undefined {
    const val = entry.attributes[attrName];
    if (Array.isArray(val)) return val[0];
    return val;
  }
}

export const ldapService = new LdapService();
