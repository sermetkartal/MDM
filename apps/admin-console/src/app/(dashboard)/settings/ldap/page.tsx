"use client";

import * as React from "react";
import { ArrowLeft, Plus, CheckCircle2, XCircle, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { LdapConfig } from "@/lib/types";

interface LdapIntegration {
  id: string;
  name: string;
  config: LdapConfig;
  isActive: boolean;
  lastSyncAt: string | null;
}

interface SyncHistoryEntry {
  id: string;
  startedAt: string;
  status: string;
  usersSynced: number;
  groupsSynced: number;
  errors: string[];
}

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

const DEMO_INTEGRATIONS: LdapIntegration[] = [
  {
    id: "ldap-1",
    name: "Active Directory",
    config: {
      ...DEFAULT_CONFIG,
      url: "ldaps://ad.company.com:636",
      bindDn: "CN=MDM Service,OU=Services,DC=company,DC=com",
      baseDn: "DC=company,DC=com",
      bindPassword: "********",
    },
    isActive: true,
    lastSyncAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

const DEMO_HISTORY: SyncHistoryEntry[] = [
  { id: "sh1", startedAt: new Date(Date.now() - 3600000).toISOString(), status: "completed", usersSynced: 156, groupsSynced: 12, errors: [] },
  { id: "sh2", startedAt: new Date(Date.now() - 7200000).toISOString(), status: "completed", usersSynced: 155, groupsSynced: 12, errors: [] },
  { id: "sh3", startedAt: new Date(Date.now() - 86400000).toISOString(), status: "failed", usersSynced: 0, groupsSynced: 0, errors: ["Connection timeout"] },
];

function LdapConfigForm({ onSave, saving }: { onSave: (name: string, config: LdapConfig) => void; saving: boolean }) {
  const [name, setName] = React.useState("Active Directory");
  const [config, setConfig] = React.useState<LdapConfig>(DEFAULT_CONFIG);
  const [testResult, setTestResult] = React.useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = React.useState(false);

  const updateConfig = (updates: Partial<LdapConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const handleTest = () => {
    setTesting(true);
    setTimeout(() => {
      setTestResult({ success: true, message: "Connection successful!" });
      setTesting(false);
    }, 800);
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
        <Button variant="outline" onClick={handleTest} disabled={testing || !config.url}>
          {testing ? "Testing..." : "Test Connection"}
        </Button>
        {testResult && (
          <div className="flex items-center gap-2 text-sm">
            {testResult.success ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-green-600">{testResult.message}</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-destructive">{testResult.message}</span>
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

function IntegrationCard({ integration, onDelete }: { integration: LdapIntegration; onDelete: (id: string) => void }) {
  const [showHistory, setShowHistory] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<{ status: string; usersSynced: number; groupsSynced: number; errors: string[] } | null>(null);
  const [syncing, setSyncing] = React.useState(false);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncResult({ status: "completed", usersSynced: 156, groupsSynced: 12, errors: [] });
      setSyncing(false);
      alert("Sync completed: 156 users, 12 groups");
    }, 800);
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this LDAP integration?")) {
      onDelete(integration.id);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">{integration.name}</CardTitle>
          <CardDescription>{integration.config.url}</CardDescription>
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
              {integration.config.syncIntervalMinutes ?? 15} min
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Base DN</span>
            <div className="font-medium truncate">{integration.config.baseDn}</div>
          </div>
        </div>

        {syncResult && (
          <div className="rounded-lg border p-3 text-sm">
            <div className="flex items-center gap-2 mb-1">
              {syncResult.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              <span className="font-medium">Sync {syncResult.status}</span>
            </div>
            <div className="text-muted-foreground">
              {syncResult.usersSynced} users, {syncResult.groupsSynced} groups synced
            </div>
            {syncResult.errors.length > 0 && (
              <div className="mt-1 text-destructive">
                {syncResult.errors.length} error(s)
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Now"}
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
                {DEMO_HISTORY.map((h) => (
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
                ))}
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
  const [integrations, setIntegrations] = React.useState<LdapIntegration[]>(DEMO_INTEGRATIONS);
  const [showForm, setShowForm] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const isLoading = false;

  const handleSave = (name: string, config: LdapConfig) => {
    setSaving(true);
    setTimeout(() => {
      const newIntegration: LdapIntegration = {
        id: `ldap-${Date.now()}`,
        name,
        config,
        isActive: true,
        lastSyncAt: null,
      };
      setIntegrations((prev) => [...prev, newIntegration]);
      setShowForm(false);
      setSaving(false);
      alert("LDAP integration saved (demo mode)");
    }, 500);
  };

  const handleDelete = (id: string) => {
    setIntegrations((prev) => prev.filter((i) => i.id !== id));
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
          <LdapConfigForm onSave={handleSave} saving={saving} />
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
            <IntegrationCard key={integration.id} integration={integration} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
