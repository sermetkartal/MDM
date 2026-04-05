"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Webhook,
  Play,
  Pause,
  RotateCcw,
  TestTube,
  Trash2,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

interface WebhookConfig {
  id: string;
  url: string;
  secret?: string;
  events: string[];
  enabled: boolean;
  created_at: string;
}

interface Delivery {
  id: string;
  webhook_id: string;
  event: string;
  status: "pending" | "success" | "failed" | "dead_letter";
  attempt_count: number;
  status_code: number | null;
  response_body: string | null;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

const EVENT_TYPES = [
  "device.enrolled",
  "device.unenrolled",
  "device.checkin",
  "compliance.violated",
  "compliance.resolved",
  "command.completed",
  "command.failed",
  "cert.expiring",
  "cert.renewed",
  "geofence.entered",
  "geofence.exited",
  "policy.assigned",
];

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  success: { icon: CheckCircle2, color: "text-green-600", label: "Success" },
  failed: { icon: XCircle, color: "text-red-600", label: "Failed" },
  pending: { icon: Clock, color: "text-yellow-600", label: "Pending" },
  dead_letter: { icon: AlertTriangle, color: "text-orange-600", label: "Dead Letter" },
};

export default function WebhooksPage() {
  const orgId = useAuthStore((s) => s.currentOrg?.id);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookConfig | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  useEffect(() => {
    if (orgId) loadWebhooks();
  }, [orgId]);

  async function loadWebhooks() {
    try {
      const res = await api.get<{ webhooks: WebhookConfig[] }>(`/v1/webhooks?org_id=${orgId}`);
      setWebhooks(res.webhooks);
    } catch {
      // Demo fallback
    }
  }

  async function loadDeliveries(webhookId: string) {
    try {
      const res = await api.get<{ deliveries: Delivery[]; total: number }>(
        `/v1/webhooks/${webhookId}/deliveries?limit=50`
      );
      setDeliveries(res.deliveries);
    } catch {
      setDeliveries([]);
    }
  }

  async function createWebhook() {
    if (!newUrl || selectedEvents.length === 0) return;
    try {
      const res = await api.post<{ id: string; secret: string }>("/v1/webhooks", {
        org_id: orgId,
        url: newUrl,
        events: selectedEvents,
      });
      setCreatedSecret(res.secret);
      await loadWebhooks();
    } catch {
      // Handle error
    }
  }

  async function toggleWebhook(webhook: WebhookConfig) {
    try {
      await api.patch(`/v1/webhooks/${webhook.id}`, { enabled: !webhook.enabled });
      await loadWebhooks();
    } catch {
      // Handle error
    }
  }

  async function deleteWebhook(id: string) {
    try {
      await api.delete(`/v1/webhooks/${id}`);
      setWebhooks(webhooks.filter((w) => w.id !== id));
      if (selectedWebhook?.id === id) setSelectedWebhook(null);
    } catch {
      // Handle error
    }
  }

  async function testWebhook(id: string) {
    try {
      await api.post(`/v1/webhooks/${id}/test`);
      if (selectedWebhook?.id === id) await loadDeliveries(id);
    } catch {
      // Handle error
    }
  }

  async function replayDelivery(webhookId: string, deliveryId: string) {
    try {
      await api.post(`/v1/webhooks/${webhookId}/deliveries/${deliveryId}/replay`);
      await loadDeliveries(webhookId);
    } catch {
      // Handle error
    }
  }

  function toggleEvent(event: string) {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }

  function selectWebhookDetail(webhook: WebhookConfig) {
    setSelectedWebhook(webhook);
    loadDeliveries(webhook.id);
  }

  if (selectedWebhook) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedWebhook(null)}>
            Back
          </Button>
          <PageHeader
            title={`Webhook: ${selectedWebhook.url}`}
            description="Delivery history and management"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => testWebhook(selectedWebhook.id)}
          >
            <TestTube className="mr-2 h-4 w-4" />
            Send Test
          </Button>
          <Badge variant={selectedWebhook.enabled ? "default" : "secondary"}>
            {selectedWebhook.enabled ? "Active" : "Paused"}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery Log</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status Code</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No deliveries yet
                    </TableCell>
                  </TableRow>
                ) : (
                  deliveries.map((d) => {
                    const statusCfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.pending;
                    const StatusIcon = statusCfg.icon;
                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <StatusIcon className={`h-4 w-4 ${statusCfg.color}`} />
                            <span className="text-sm">{statusCfg.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {d.event}
                          </Badge>
                        </TableCell>
                        <TableCell>{d.status_code || "-"}</TableCell>
                        <TableCell>{d.duration_ms ? `${d.duration_ms}ms` : "-"}</TableCell>
                        <TableCell>{d.attempt_count}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(d.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {(d.status === "failed" || d.status === "dead_letter") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => replayDelivery(selectedWebhook.id, d.id)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Webhooks"
          description="Send real-time event notifications to external services"
        />
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setCreatedSecret(null); setNewUrl(""); setSelectedEvents([]); } }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Webhook
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Webhook</DialogTitle>
            </DialogHeader>
            {createdSecret ? (
              <div className="space-y-4">
                <div className="rounded-md bg-green-50 border border-green-200 p-4">
                  <p className="text-sm font-medium text-green-800 mb-2">Webhook created successfully</p>
                  <p className="text-xs text-green-700 mb-2">
                    Save this signing secret -- it will not be shown again:
                  </p>
                  <code className="block text-xs bg-white p-2 rounded border font-mono break-all">
                    {createdSecret}
                  </code>
                </div>
                <Button onClick={() => { setCreateOpen(false); setCreatedSecret(null); setNewUrl(""); setSelectedEvents([]); }}>
                  Done
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Payload URL</label>
                  <Input
                    placeholder="https://example.com/webhooks/mdm"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Events</label>
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                    {EVENT_TYPES.map((evt) => (
                      <label key={evt} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(evt)}
                          onChange={() => toggleEvent(evt)}
                          className="rounded"
                        />
                        <span className="font-mono text-xs">{evt}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <Button onClick={createWebhook} disabled={!newUrl || selectedEvents.length === 0}>
                  Create Webhook
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {webhooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Webhook className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No webhooks configured</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a webhook to receive real-time event notifications
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <Card key={webhook.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="rounded-lg bg-muted p-2">
                  <Webhook className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium font-mono truncate">{webhook.url}</span>
                    <Badge variant={webhook.enabled ? "default" : "secondary"} className="text-xs">
                      {webhook.enabled ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {webhook.events.slice(0, 3).map((evt) => (
                      <Badge key={evt} variant="outline" className="text-xs font-mono">
                        {evt}
                      </Badge>
                    ))}
                    {webhook.events.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{webhook.events.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleWebhook(webhook)}
                    title={webhook.enabled ? "Pause" : "Resume"}
                  >
                    {webhook.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => testWebhook(webhook.id)}
                    title="Send test event"
                  >
                    <TestTube className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteWebhook(webhook.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => selectWebhookDetail(webhook)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
