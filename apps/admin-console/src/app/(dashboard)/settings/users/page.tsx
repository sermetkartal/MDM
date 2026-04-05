"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Plus, UserX, Shield } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  roleId: string;
  lastLoginAt: string | null;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export default function UsersPage() {
  const [userList, setUserList] = useState<User[]>([]);
  const [roleList, setRoleList] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get<{ data: User[] }>("/v1/roles/../users").catch(() => ({ data: [] as User[] })),
        api.get<{ data: Role[] }>("/v1/roles"),
      ]);
      // Users endpoint - try the settings users endpoint
      try {
        const uRes = await api.get<{ data: User[] }>("/v1/users");
        setUserList(uRes.data);
      } catch {
        setUserList([]);
      }
      setRoleList(rolesRes.data);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function getRoleName(roleId: string): string {
    return roleList.find((r) => r.id === roleId)?.name ?? "Unknown";
  }

  async function handleAssignRole(userId: string, roleId: string) {
    try {
      await api.post(`/v1/roles/${roleId}/users`, { userId });
      setRoleDialogOpen(false);
      fetchData();
    } catch {
      // handle error
    }
  }

  async function handleDeactivate(userId: string) {
    if (!confirm("Are you sure you want to deactivate this user?")) return;
    try {
      await api.patch(`/v1/users/${userId}`, { isActive: false });
      fetchData();
    } catch {
      // handle error
    }
  }

  async function handleInvite() {
    try {
      await api.post("/v1/users/invite", { email: inviteEmail, roleId: inviteRole });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("");
      fetchData();
    } catch {
      // handle error
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Users" description="Manage admin users and role assignments" />
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage admin users, assign roles, and invite new users"
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Invite User
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No users found. Users will appear here once created or provisioned via SSO/SCIM.
                  </TableCell>
                </TableRow>
              ) : (
                userList.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email}
                        </p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getRoleName(user.roleId)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "default" : "secondary"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setRoleDialogOpen(true);
                          }}
                        >
                          <Shield className="h-3.5 w-3.5 mr-1" />
                          Role
                        </Button>
                        {user.isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeactivate(user.id)}
                          >
                            <UserX className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invite User Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>
              Send an invitation to a new admin user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@company.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="">Select a role...</option>
                {roleList.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} {role.isSystem ? "(system)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={!inviteEmail || !inviteRole}>
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Role</DialogTitle>
            <DialogDescription>
              Change the role for {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {roleList.map((role) => (
              <button
                key={role.id}
                className={`w-full text-left rounded-md border p-3 text-sm transition-colors hover:bg-muted/50 ${
                  selectedUser?.roleId === role.id ? "border-primary bg-primary/5" : "border-border"
                }`}
                onClick={() => {
                  if (selectedUser) handleAssignRole(selectedUser.id, role.id);
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{role.name}</span>
                    {role.isSystem && (
                      <Badge variant="secondary" className="ml-2 text-xs">System</Badge>
                    )}
                  </div>
                  {selectedUser?.roleId === role.id && (
                    <Badge variant="default" className="text-xs">Current</Badge>
                  )}
                </div>
                {role.description && (
                  <p className="text-xs text-muted-foreground mt-1">{role.description}</p>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
