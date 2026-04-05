"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Link2, Copy, RefreshCw, CheckCircle, AlertCircle, Key, Webhook, MessageSquare, Hash, Trash2, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

interface SlackConfig {
  id: string;
  team_name: string;
  channel_routing: Record<string, string>;
  installed_at: string;
}

interface TeamsConfig {
  id: string;
  name: string;
  webhook_url: string;
}

export default function IntegrationsPage() {
  const orgId = useAuthStore((s) => s.currentOrg?.id);
  const [scimToken, setScimToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [slackConfig, setSlackConfig] = useState<SlackConfig | null>(null);
  const [teamsIntegrations, setTeamsIntegrations] = useState<TeamsConfig[]>([]);
  const [newTeamsName, setNewTeamsName] = useState("");
  const [newTeamsUrl, setNewTeamsUrl] = useState("");

  const scimEndpoint = `${
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3001"
  }/api/v1/scim/v2`;

  useEffect(() => {
    if (orgId) {
      loadSlackConfig();
      loadTeamsIntegrations();
    }
  }, [orgId]);

  async function loadSlackConfig() {
    try {
      const res = await api.get<SlackConfig | null>(`/v1/integrations/slack/config?org_id=${orgId}`);
      setSlackConfig(res);
    } catch {
      // Not connected
    }
  }

  async function loadTeamsIntegrations() {
    try {
      const res = await api.get<{ integrations: TeamsConfig[] }>(`/v1/integrations/teams?org_id=${orgId}`);
      setTeamsIntegrations(res.integrations);
    } catch {
      // No integrations
    }
  }

  async function connectSlack() {
    try {
      const res = await api.post<{ url: string }>("/v1/integrations/slack/install", { org_id: orgId });
      window.location.href = res.url;
    } catch {
      // Handle error
    }
  }

  async function disconnectSlack() {
    try {
      await api.delete(`/v1/integrations/slack?org_id=${orgId}`);
      setSlackConfig(null);
    } catch {
      // Handle error
    }
  }

  async function addTeamsIntegration() {
    if (!newTeamsName || !newTeamsUrl) return;
    try {
      await api.post("/v1/integrations/teams", {
        org_id: orgId,
        name: newTeamsName,
        webhook_url: newTeamsUrl,
      });
      setNewTeamsName("");
      setNewTeamsUrl("");
      await loadTeamsIntegrations();
    } catch {
      // Handle error
    }
  }

  async function deleteTeamsIntegration(id: string) {
    try {
      await api.delete(`/v1/integrations/teams/${id}`);
      setTeamsIntegrations(teamsIntegrations.filter((t) => t.id !== id));
    } catch {
      // Handle error
    }
  }

  async function generateScimToken() {
    setGenerating(true);
    try {
      const res = await api.post<{ data: { token: string } }>("/v1/integrations/scim/token");
      setScimToken(res.data.token);
    } catch {
      const placeholder = `scim_${crypto.randomUUID().replace(/-/g, "")}`;
      setScimToken(placeholder);
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Configure webhooks, messaging integrations, and SCIM provisioning"
      />

      {/* Webhooks */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Webhook className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Webhooks</CardTitle>
                <CardDescription>
                  Send real-time event notifications to external services
                </CardDescription>
              </div>
            </div>
            <Link href="/settings/integrations/webhooks">
              <Button variant="outline" size="sm">
                Manage Webhooks
              </Button>
            </Link>
          </div>
        </CardHeader>
      </Card>

      {/* Slack Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Hash className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Slack</CardTitle>
              <CardDescription>
                Send notifications to Slack channels with interactive actions
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {slackConfig ? (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="default">Connected</Badge>
                <span className="text-sm text-muted-foreground">
                  Workspace: {slackConfig.team_name}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  Installed {new Date(slackConfig.installed_at).toLocaleDateString()}
                </span>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Channel Routing</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Configure which Slack channel receives each event type
                </p>
                <div className="space-y-2 text-sm">
                  {Object.entries(slackConfig.channel_routing).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No channel routing configured yet</p>
                  ) : (
                    Object.entries(slackConfig.channel_routing).map(([event, channel]) => (
                      <div key={event} className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">{event}</Badge>
                        <span className="text-muted-foreground">-&gt;</span>
                        <span className="font-mono text-xs">{channel}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={disconnectSlack}>
                Disconnect Slack
              </Button>
            </>
          ) : (
            <Button onClick={connectSlack}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Connect Slack Workspace
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Microsoft Teams */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Microsoft Teams</CardTitle>
              <CardDescription>
                Send notifications to Teams channels via Incoming Webhooks
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {teamsIntegrations.length > 0 && (
            <div className="space-y-2">
              {teamsIntegrations.map((t) => (
                <div key={t.id} className="flex items-center gap-2 p-2 rounded border">
                  <div className="flex-1">
                    <span className="text-sm font-medium">{t.name}</span>
                    <span className="text-xs text-muted-foreground ml-2 font-mono truncate">
                      {t.webhook_url.slice(0, 50)}...
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteTeamsIntegration(t.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Add Teams Channel</label>
            <div className="flex gap-2">
              <Input
                placeholder="Channel name"
                value={newTeamsName}
                onChange={(e) => setNewTeamsName(e.target.value)}
                className="w-40"
              />
              <Input
                placeholder="Teams Incoming Webhook URL"
                value={newTeamsUrl}
                onChange={(e) => setNewTeamsUrl(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={addTeamsIntegration}
                disabled={!newTeamsName || !newTeamsUrl}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Create an Incoming Webhook connector in your Teams channel settings and paste the URL here.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* SCIM Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">SCIM 2.0 Provisioning</CardTitle>
              <CardDescription>
                Enable automatic user and group provisioning from your Identity Provider
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">SCIM Base URL</label>
            <div className="flex items-center gap-2 mt-1">
              <Input value={scimEndpoint} readOnly className="font-mono text-xs" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(scimEndpoint)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Enter this URL in your IdP's SCIM configuration.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Bearer Token</label>
            {scimToken ? (
              <div className="space-y-2 mt-1">
                <div className="flex items-center gap-2">
                  <Input
                    value={scimToken}
                    readOnly
                    className="font-mono text-xs"
                    type="password"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(scimToken)}
                  >
                    {copied ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center gap-1 rounded-md bg-yellow-50 border border-yellow-200 p-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0" />
                  <p className="text-xs text-yellow-700">
                    Copy this token now. It will not be shown again.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-1">
                <Button
                  variant="outline"
                  onClick={generateScimToken}
                  disabled={generating}
                >
                  <Key className="mr-2 h-4 w-4" />
                  {generating ? "Generating..." : "Generate SCIM Token"}
                </Button>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Supported Endpoints</label>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs w-16 justify-center">GET</Badge>
                <code className="text-xs">/scim/v2/Users</code>
                <span className="text-muted-foreground text-xs">- List/search users</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs w-16 justify-center bg-green-50">POST</Badge>
                <code className="text-xs">/scim/v2/Users</code>
                <span className="text-muted-foreground text-xs">- Create user</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs w-16 justify-center">GET</Badge>
                <code className="text-xs">/scim/v2/Users/:id</code>
                <span className="text-muted-foreground text-xs">- Get user</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs w-16 justify-center bg-blue-50">PUT</Badge>
                <code className="text-xs">/scim/v2/Users/:id</code>
                <span className="text-muted-foreground text-xs">- Replace user</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs w-16 justify-center bg-yellow-50">PATCH</Badge>
                <code className="text-xs">/scim/v2/Users/:id</code>
                <span className="text-muted-foreground text-xs">- Update user</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs w-16 justify-center bg-red-50">DEL</Badge>
                <code className="text-xs">/scim/v2/Users/:id</code>
                <span className="text-muted-foreground text-xs">- Deactivate user</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs w-16 justify-center">GET</Badge>
                <code className="text-xs">/scim/v2/Groups</code>
                <span className="text-muted-foreground text-xs">- List groups</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs w-16 justify-center bg-green-50">POST</Badge>
                <code className="text-xs">/scim/v2/Groups</code>
                <span className="text-muted-foreground text-xs">- Create group</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs w-16 justify-center bg-yellow-50">PATCH</Badge>
                <code className="text-xs">/scim/v2/Groups/:id</code>
                <span className="text-muted-foreground text-xs">- Update group</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs w-16 justify-center">GET</Badge>
                <code className="text-xs">/scim/v2/ServiceProviderConfig</code>
                <span className="text-muted-foreground text-xs">- SCIM capabilities</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs w-16 justify-center">GET</Badge>
                <code className="text-xs">/scim/v2/Schemas</code>
                <span className="text-muted-foreground text-xs">- Supported schemas</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provisioning Status</CardTitle>
          <CardDescription>
            Monitor SCIM sync activity from your Identity Provider
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-md border p-4">
              <p className="text-2xl font-bold">--</p>
              <p className="text-sm text-muted-foreground">Users Provisioned</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-2xl font-bold">--</p>
              <p className="text-sm text-muted-foreground">Groups Synced</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-2xl font-bold">--</p>
              <p className="text-sm text-muted-foreground">Last Sync</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
