import { eq, and } from 'drizzle-orm';
import { db } from './index.js';
import { roles, organizations } from './schema.js';

interface SystemRoleDefinition {
  name: string;
  description: string;
  permissions: string[];
}

const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    name: 'org_admin',
    description: 'Full organization administrator with all permissions',
    permissions: ['*:*'],
  },
  {
    name: 'device_admin',
    description: 'Manage devices, commands, and view policies and groups',
    permissions: ['devices:*', 'commands:*', 'policies:read', 'groups:read'],
  },
  {
    name: 'policy_admin',
    description: 'Manage policies, compliance rules, and view groups and devices',
    permissions: ['policies:*', 'compliance:*', 'groups:read', 'devices:read'],
  },
  {
    name: 'app_admin',
    description: 'Manage applications and view devices',
    permissions: ['apps:*', 'devices:read'],
  },
  {
    name: 'helpdesk',
    description: 'View devices and send limited commands (lock, message, ring, locate)',
    permissions: [
      'devices:read',
      'commands:lock',
      'commands:send_message',
      'commands:ring_device',
      'commands:request_location',
    ],
  },
  {
    name: 'viewer',
    description: 'Read-only access to all resources',
    permissions: ['*:read'],
  },
  {
    name: 'auditor',
    description: 'Access audit logs, compliance reports, and all reports',
    permissions: ['audit:read', 'compliance:read', 'reports:*'],
  },
];

export async function seedSystemRoles(): Promise<void> {
  const allOrgs = await db.select({ id: organizations.id }).from(organizations);

  for (const org of allOrgs) {
    for (const roleDef of SYSTEM_ROLES) {
      const [existing] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.orgId, org.id), eq(roles.name, roleDef.name), eq(roles.isSystem, true)))
        .limit(1);

      if (!existing) {
        await db.insert(roles).values({
          orgId: org.id,
          name: roleDef.name,
          description: roleDef.description,
          permissions: roleDef.permissions,
          isSystem: true,
        });
      }
    }
  }
}

export { SYSTEM_ROLES };
