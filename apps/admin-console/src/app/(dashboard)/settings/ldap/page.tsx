"use client";

import * as React from "react";
import { ArrowLeft, Plus, CheckCircle2, XCircle, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useLdapIntegrations,
  useCreateLdapIntegration,
  useTestLdapConnection,
  useSyncLdap,
  useLdapSyncHistory,
  useDeleteLdapIntegration,
} from "@/hooks/queries/use-groups";
import type { LdapConfig, LdapIntegration } from "@/lib/types";

const DEFAULT_CONFIG: LdapConfig = {
  url: "",
  bindDn: "",
  bindPassword: "",
  baseDn: "",
  userFilter: "(objectClass=person)",
  groupFilter: "(objectClass=group)",
  userMapping: {
    email: "mail",
    firstName: "givenName",
    lastName: "sn",
    displayName: "displayName",
  },
  groupMapping: {
    name: "cn",
    description: "description",
    memberAttribute: "member",
  },
  syncIntervalMinutes: 15,
};

function LdapConfigForm({ onSave, saving }: { onSave: (name: string, config: LdapConfig) => void; saving: boolean }) {
  const [name, setName] = React.useState("Active Directory");
  const [config, setConfig] = React.useState<LdapConfig>(DEFAULT_CONFIG);
  const testConnection = useTestLdapConnection();

  const updateConfig = (updates: Partial<LdapConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const handleTest = () => {
    testConnection.mutate(config);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Integration Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Active Directory" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Server URL</label>
            <Input
              value={config.url}
              onChange={(e) => updateConfig({ url: e.target.value })}
              placeholder="ldaps://ad.example.com:636"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Bind DN</label>
              <Input
                value={config.bindDn}
                onChange={(e) => updateConfig({ bindDn: e.target.value })}
                placeholder="CN=svc-mdm,OU=Service,DC=example,DC=com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Bind Password</label>
              <Input
                type="password"
                value={config.bindPassword}
                onChange={(e) => updateConfig({ bindPassword: e.target.value })}
                placeholder="Service account password"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Base DN</label>
            <Input
              value={config.baseDn}
              onChange={(e) => updateConfig({ baseDn: e.target.value })}
              placeholder="DC=example,DC=com"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">User Sync Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">User Search Filter</label>
            <Input
              value={config.userFilter}
              onChange={(e) => updateConfig({ userFilter: e.target.value })}
              placeholder="(objectClass=person)"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Attribute</label>
              <Input
                value={config.userMapping.email}
                onChange={(e) =>
                  updateConfig({ userMapping: { ...config.userMapping, email: e.target.value } })
                }
                placeholder="mail or sAMAccountName"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Display Name Attribute</label>
              <Input
                value={config.userMapping.displayName}
                onChange={(e) =>
                  updateConfig({
                    userMapping: { ...config.userMapping, displayName: e.target.value },
                  })
                }
                placeholder="displayName"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">First Name Attribute</label>
              <Input
                value={config.userMapping.firstName}
                onChange={(e) =>
                  updateConfig({
                    userMapping: { ...config.userMapping, firstName: e.target.value },
                  })
                }
                placeholder="givenName"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Last Name Attribute</label>
              <Input
                value={config.userMapping.lastName}
                onChange={(e) =>
                  updateConfig({
                    userMapping: { ...config.userMapping, lastName: e.target.value },
                  })
                }
                placeholder="sn"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Group Sync Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Group Search Filter</label>
            <Input
              value={config.groupFilter}
              onChange={(e) => updateConfig({ groupFilter: e.target.value })}
              placeholder="(objectClass=group)"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name Attribute</label>
              <Input
                value={config.groupMapping.name}
                onChange={(e) =>
                  updateConfig({ groupMapping: { ...config.groupMapping, name: e.target.value } })
                }
                placeholder="cn"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description Attribute</label>
              <Input
                value={config.groupMapping.description}
                onChange={(e) =>
                  updateConfig({
                    groupMapping: { ...config.groupMapping, description: e.target.value },
                  })
                }
                placeholder="description"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Member Attribute</label>
              <Input
                value={config.groupMapping.memberAttribute}
                onChange={(e) =>
                  updateConfig({
                    groupMapping: { ...config.groupMapping, memberAttribute: e.target.value },
                  })
                }
                placeholder="member"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sync Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Sync Interval (minutes)</label>
            <Input
              type="number"
              min={5}
              max={1440}
              value={config.syncIntervalMinutes}
              onChange={(e) => updateConfig({ syncIntervalMinutes: parseInt(e.target.value) || 15 })}
            />
            <p className="text-xs text-muted-foreground">
              How often to sync users and groups from LDAP (5-1440 minutes)
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={handleTest} disabled={testConnection.isPending || !config.url}>
          {testConnection.isPending ? "Testing..." : "Test Connection"}
        </Button>
        {testConnection.data && (
          <div className="flex items-center gap-2 text-sm">
            {testConnection.data.success ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-green-600">{testConnection.data.message}</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-destructive">{testConnection.data.message}</span>
              </>
            )}
          </div>
        )}
        <div className="flex-1" />
        <Button
          onClick={() => onSave(name, config)}
          disabled={saving || !name || !config.url || !config.bindDn || !config.baseDn}
        >
          {saving ? "Saving..." : "Save Integration"}
        </Button>
      </div>
    </div>
  );
}

function IntegrationCard({ integration }: { integration: LdapIntegration }) {
  const syncMutation = useSyncLdap(integration.id);
  const deleteMutation = useDeleteLdapIntegration();
  const { data: historyData } = useLdapSyncHistory(integration.id);
  const [showHistory, setShowHistory] = React.useState(false);

  const history = historyData?.data ?? [];

  const handleSync = () => {
    syncMutation.mutate();
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this LDAP integration?")) {
      deleteMutation.mutate(integration.id);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">{integration.name}</CardTitle>
          <CardDescription>{(integration.config as any).url}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={integration.isActive ? "default" : "secondary"}>
            {integration.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Last Sync</span>
            <div className="font-medium">
              {integration.lastSyncAt
                ? new Date(integration.lastSyncAt).toLocaleString()
                : "Never"}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Sync Interval</span>
            <div className="font-medium">
              {(integration.config as any).syncIntervalMinutes ?? 15} min
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Base DN</span>
            <div className="font-medium truncate">{(integration.config as any).baseDn}</div>
          </div>
        </div>

        {syncMutation.data && (
          <div className="rounded-lg border p-3 text-sm">
            <div className="flex items-center gap-2 mb-1">
              {syncMutation.data.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              <span className="font-medium">Sync {syncMutation.data.status}</span>
            </div>
            <div className="text-muted-foreground">
              {syncMutation.data.usersSynced} users, {syncMutation.data.groupsSynced} groups synced
            </div>
            {syncMutation.data.errors.length > 0 && (
              <div className="mt-1 text-destructive">
                {syncMutation.data.errors.length} error(s)
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncMutation.isPending}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing..." : "Sync Now"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? "Hide History" : "Sync History"}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>

        {showHistory && (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Time</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-left p-2 font-medium">Users</th>
                  <th className="text-left p-2 font-medium">Groups</th>
                  <th className="text-left p-2 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted-foreground p-4">
                      No sync history
                    </td>
                  </tr>
                ) : (
                  history.map((h) => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="p-2">{new Date(h.startedAt).toLocaleString()}</td>
                      <td className="p-2">
                        <Badge variant={h.status === "completed" ? "default" : h.status === "failed" ? "destructive" : "secondary"}>
                          {h.status}
                        </Badge>
                      </td>
                      <td className="p-2">{h.usersSynced}</td>
                      <td className="p-2">{h.groupsSynced}</td>
                      <td className="p-2">{h.errors?.length ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LdapSettingsPage() {
  const router = useRouter();
  const { data: integrationsData, isLoading } = useLdapIntegrations();
  const createIntegration = useCreateLdapIntegration();
  const [showForm, setShowForm] = React.useState(false);

  const integrations = integrationsData?.data ?? [];

  const handleSave = (name: string, config: LdapConfig) => {
    createIntegration.mutate(
      { name, config },
      { onSuccess: () => setShowForm(false) },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/settings")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title="LDAP / Active Directory"
          description="Configure LDAP/AD integration for user and group synchronization"
          actions={
            !showForm && (
              <Button onClick={() => setShowForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Integration
              </Button>
            )
          }
        />
      </div>

      {showForm && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">New LDAP Integration</h3>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
          <LdapConfigForm onSave={handleSave} saving={createIntegration.isPending} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : integrations.length === 0 && !showForm ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-muted-foreground mb-4">
              No LDAP integrations configured yet
            </div>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Integration
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {integrations.map((integration) => (
            <IntegrationCard key={integration.id} integration={integration} />
          ))}
        </div>
      )}
    </div>
  );
}
