"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
}

const RESOURCE_GROUPS: Record<string, string[]> = {
  Devices: ["devices:read", "devices:write", "devices:delete"],
  Policies: ["policies:read", "policies:write", "policies:delete"],
  Apps: ["apps:read", "apps:write", "apps:delete"],
  Groups: ["groups:read", "groups:write", "groups:delete"],
  Commands: ["commands:read", "commands:write", "commands:lock", "commands:send_message", "commands:ring_device", "commands:request_location"],
  Compliance: ["compliance:read", "compliance:write", "compliance:delete"],
  Reports: ["reports:read", "reports:write", "reports:export"],
  Settings: ["settings:read", "settings:write"],
  Users: ["users:read", "users:write", "users:delete"],
  Audit: ["audit:read"],
  Enrollment: ["enrollment:read", "enrollment:write", "enrollment:delete"],
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

  const fetchRoles = useCallback(async () => {
    try {
      const res = await api.get<{ data: Role[] }>("/v1/roles");
      setRoles(res.data);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  function openCreate() {
    setEditingRole(null);
    setName("");
    setDescription("");
    setSelectedPermissions(new Set());
    setDialogOpen(true);
  }

  function openEdit(role: Role) {
    setEditingRole(role);
    setName(role.name);
    setDescription(role.description ?? "");
    setSelectedPermissions(new Set(role.permissions));
    setDialogOpen(true);
  }

  function togglePermission(perm: string) {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) {
        next.delete(perm);
      } else {
        next.add(perm);
      }
      return next;
    });
  }

  function toggleResourceAll(perms: string[]) {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      const allSelected = perms.every((p) => next.has(p));
      if (allSelected) {
        perms.forEach((p) => next.delete(p));
      } else {
        perms.forEach((p) => next.add(p));
      }
      return next;
    });
  }

  async function handleSave() {
    const permissions = Array.from(selectedPermissions);
    try {
      if (editingRole) {
        await api.patch(`/v1/roles/${editingRole.id}`, { name, description, permissions });
      } else {
        await api.post("/v1/roles", { name, description, permissions });
      }
      setDialogOpen(false);
      fetchRoles();
    } catch {
      // handle error
    }
  }

  async function handleDelete(roleId: string) {
    if (!confirm("Are you sure you want to delete this role?")) return;
    try {
      await api.delete(`/v1/roles/${roleId}`);
      fetchRoles();
    } catch {
      // handle error
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Roles" description="Manage roles and permissions" />
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles"
        description="Manage roles and permissions (RBAC)"
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Create Role
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                {role.name}
                {role.isSystem && (
                  <Badge variant="secondary" className="text-xs">System</Badge>
                )}
              </CardTitle>
              {!role.isSystem && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(role)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(role.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                {role.description ?? "No description"}
              </p>
              <div className="flex flex-wrap gap-1">
                {role.permissions.slice(0, 5).map((perm) => (
                  <Badge key={perm} variant="outline" className="text-xs">
                    {perm}
                  </Badge>
                ))}
                {role.permissions.length > 5 && (
                  <Badge variant="outline" className="text-xs">
                    +{role.permissions.length - 5} more
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "Create Role"}</DialogTitle>
            <DialogDescription>
              {editingRole ? "Update role name, description, and permissions." : "Create a new custom role with specific permissions."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. fleet_manager" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the role" />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Permissions</label>
              <div className="space-y-3">
                {Object.entries(RESOURCE_GROUPS).map(([resource, perms]) => (
                  <div key={resource} className="border rounded-md p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={perms.every((p) => selectedPermissions.has(p))}
                        onChange={() => toggleResourceAll(perms)}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">{resource}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 ml-5">
                      {perms.map((perm) => (
                        <label key={perm} className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={selectedPermissions.has(perm)}
                            onChange={() => togglePermission(perm)}
                            className="rounded"
                          />
                          {perm.split(":")[1]}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name || selectedPermissions.size === 0}>
              {editingRole ? "Save Changes" : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
