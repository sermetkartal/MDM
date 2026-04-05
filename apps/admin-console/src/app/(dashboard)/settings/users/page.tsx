"use client";

import { useState } from "react";
import { Plus, UserX, Shield } from "lucide-react";
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
interface User {
  id: string;
  email: string;
  display_name: string;
  status: string;
  lastLoginAt: string | null;
  roles: string[];
}

interface Role {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: string[];
}

const dummyUsers: User[] = [
  { id: "u1", email: "admin@mdm.local", display_name: "System Admin", status: "active", lastLoginAt: new Date().toISOString(), roles: ["org_admin"] },
  { id: "u2", email: "john@company.com", display_name: "John Davis", status: "active", lastLoginAt: new Date(Date.now() - 86400000).toISOString(), roles: ["device_admin"] },
  { id: "u3", email: "sarah@company.com", display_name: "Sarah Miller", status: "active", lastLoginAt: new Date(Date.now() - 172800000).toISOString(), roles: ["helpdesk"] },
  { id: "u4", email: "mike@company.com", display_name: "Mike Chen", status: "suspended", lastLoginAt: null, roles: ["viewer"] },
];

const dummyRoles: Role[] = [
  { id: "r1", name: "org_admin", description: "Full access", is_system: true, permissions: ["*:*"] },
  { id: "r2", name: "device_admin", description: "Manage devices and commands", is_system: true, permissions: ["devices:*", "commands:*"] },
  { id: "r3", name: "helpdesk", description: "View devices, lock, message", is_system: true, permissions: ["devices:read", "commands:lock"] },
  { id: "r4", name: "viewer", description: "Read-only access", is_system: true, permissions: ["*:read"] },
];

export default function UsersPage() {
  const [userList, setUserList] = useState<User[]>(dummyUsers);
  const [roleList] = useState<Role[]>(dummyRoles);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");

  function getRoleName(roles: string[]): string {
    return roles[0] ?? "Unknown";
  }

  function handleAssignRole(userId: string, roleId: string) {
    alert("Demo mode");
    setUserList((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, roles: [roleList.find((r) => r.id === roleId)?.name ?? u.roles[0]] } : u))
    );
    setRoleDialogOpen(false);
  }

  function handleDeactivate(userId: string) {
    if (!confirm("Are you sure you want to deactivate this user?")) return;
    alert("Demo mode");
    setUserList((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status: "suspended" } : u))
    );
  }

  function handleInvite() {
    alert("Demo mode");
    setInviteOpen(false);
    setInviteEmail("");
    setInviteRole("");
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
                          {user.display_name || user.email}
                        </p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getRoleName(user.roles)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.status === "active" ? "default" : "secondary"}>
                        {user.status === "active" ? "Active" : "Suspended"}
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
                        {user.status === "active" && (
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
                    {role.name} {role.is_system ? "(system)" : ""}
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
                  selectedUser?.roles[0] === role.name ? "border-primary bg-primary/5" : "border-border"
                }`}
                onClick={() => {
                  if (selectedUser) handleAssignRole(selectedUser.id, role.id);
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{role.name}</span>
                    {role.is_system && (
                      <Badge variant="secondary" className="ml-2 text-xs">System</Badge>
                    )}
                  </div>
                  {selectedUser?.roles[0] === role.name && (
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
