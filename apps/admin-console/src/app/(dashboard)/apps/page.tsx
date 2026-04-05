"use client";

import * as React from "react";
import { Plus, Package, Upload, RotateCcw, Trash2, ArrowLeft, Users, Monitor } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";

// --- Types ---

interface App {
  id: string;
  name: string;
  bundleId: string;
  platform: string;
  type: string;
  iconUrl: string | null;
  description: string | null;
  createdAt: string;
  [key: string]: unknown;
}

interface AppVersion {
  id: string;
  appId: string;
  version: string;
  versionCode: number | null;
  downloadUrl: string | null;
  fileHash: string | null;
  fileSize: number | null;
  releaseNotes: string | null;
  isCurrent: boolean;
  createdAt: string;
  [key: string]: unknown;
}

interface AppAssignment {
  id: string;
  appId: string;
  deviceId: string | null;
  groupId: string | null;
  installType: string;
  createdAt: string;
  [key: string]: unknown;
}

// --- App List View ---

interface AppRow {
  id: string;
  name: string;
  bundleId: string;
  platform: string;
  type: string;
  createdAt: string;
  [key: string]: unknown;
}

const appColumns: Column<AppRow>[] = [
  {
    key: "name",
    header: "Application",
    sortable: true,
    render: (row) => (
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">{row.bundleId}</p>
        </div>
      </div>
    ),
  },
  {
    key: "platform",
    header: "Platform",
    render: (row) => <Badge variant="secondary">{row.platform}</Badge>,
  },
  {
    key: "type",
    header: "Type",
    render: (row) => <Badge variant="secondary">{row.type}</Badge>,
  },
  {
    key: "createdAt",
    header: "Added",
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
];

// --- Main Page ---

export default function AppsPage() {
  const [apps, setApps] = React.useState<AppRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedApp, setSelectedApp] = React.useState<App | null>(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);

  const fetchApps = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: App[]; pagination: unknown }>("/apps");
      setApps(res.data);
    } catch {
      // API may not be available in dev
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  if (selectedApp) {
    return (
      <AppDetailView
        app={selectedApp}
        onBack={() => {
          setSelectedApp(null);
          fetchApps();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="App Management"
        description="Deploy and manage applications across devices"
        actions={
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add App
          </Button>
        }
      />
      <DataTable
        columns={appColumns}
        data={apps}
        searchKey="name"
        searchPlaceholder="Search apps..."
        onRowClick={(row) => setSelectedApp(row as unknown as App)}
      />
      <CreateAppDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={() => {
          setShowCreateDialog(false);
          fetchApps();
        }}
      />
    </div>
  );
}

// --- Create App Dialog ---

function CreateAppDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = React.useState("");
  const [bundleId, setBundleId] = React.useState("");
  const [platform, setPlatform] = React.useState("android");
  const [type, setType] = React.useState("enterprise");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    if (!name || !bundleId) return;
    try {
      setSubmitting(true);
      await api.post("/apps", { name, bundleId, platform, type, description: description || undefined });
      setName("");
      setBundleId("");
      setDescription("");
      onCreated();
    } catch (e) {
      console.error("Failed to create app:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Application</DialogTitle>
          <DialogDescription>Add a new app to manage across your devices.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My App" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Package / Bundle ID</label>
            <Input value={bundleId} onChange={(e) => setBundleId(e.target.value)} placeholder="com.example.app" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Platform</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="android">Android</option>
                <option value="ios">iOS</option>
                <option value="windows">Windows</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="enterprise">Enterprise</option>
                <option value="public">Public</option>
                <option value="web_clip">Web Clip</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !name || !bundleId}>
            {submitting ? "Creating..." : "Create App"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- App Detail View ---

function AppDetailView({ app, onBack }: { app: App; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{app.name}</h1>
          <p className="text-muted-foreground">{app.bundleId}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Badge variant="secondary">{app.platform}</Badge>
          <Badge variant="secondary">{app.type}</Badge>
        </div>
      </div>

      <Tabs defaultValue="versions">
        <TabsList>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="status">Install Status</TabsTrigger>
        </TabsList>
        <TabsContent value="versions">
          <VersionsTab appId={app.id} />
        </TabsContent>
        <TabsContent value="assignments">
          <AssignmentsTab appId={app.id} />
        </TabsContent>
        <TabsContent value="status">
          <InstallStatusTab appId={app.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Versions Tab ---

function VersionsTab({ appId }: { appId: string }) {
  const [versions, setVersions] = React.useState<AppVersion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showUpload, setShowUpload] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [versionForm, setVersionForm] = React.useState({ version: "", releaseNotes: "" });
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);

  const fetchVersions = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: AppVersion[] }>(`/apps/${appId}/versions`);
      setVersions(res.data);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  React.useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleUpload = async () => {
    if (!selectedFile || !versionForm.version) return;
    try {
      setUploading(true);
      setUploadProgress(30);

      await api.post(`/apps/${appId}/versions`, {
        version: versionForm.version,
        fileSize: selectedFile.size,
        releaseNotes: versionForm.releaseNotes || undefined,
      });

      setUploadProgress(100);
      setShowUpload(false);
      setSelectedFile(null);
      setVersionForm({ version: "", releaseNotes: "" });
      fetchVersions();
    } catch (e) {
      console.error("Failed to upload version:", e);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRollback = async (versionId: string) => {
    try {
      await api.post(`/apps/${appId}/versions/${versionId}/rollback`);
      fetchVersions();
    } catch (e) {
      console.error("Failed to rollback:", e);
    }
  };

  const versionColumns: Column<AppVersion>[] = [
    {
      key: "version",
      header: "Version",
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.version}</span>
          {row.isCurrent && <Badge>Current</Badge>}
        </div>
      ),
    },
    {
      key: "fileSize",
      header: "Size",
      render: (row) =>
        row.fileSize ? `${(row.fileSize / (1024 * 1024)).toFixed(1)} MB` : "N/A",
    },
    {
      key: "createdAt",
      header: "Uploaded",
      render: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      render: (row) =>
        !row.isCurrent ? (
          <Button variant="outline" size="sm" onClick={() => handleRollback(row.id)}>
            <RotateCcw className="mr-1 h-3 w-3" />
            Rollback
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Version History</h3>
        <Button onClick={() => setShowUpload(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Upload APK
        </Button>
      </div>

      {showUpload && (
        <Card className="p-4 space-y-4">
          <h4 className="font-medium">Upload New Version</h4>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">APK File</label>
              <div className="mt-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".apk"
                  className="text-sm"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Version Name</label>
                <Input
                  value={versionForm.version}
                  onChange={(e) => setVersionForm((f) => ({ ...f, version: e.target.value }))}
                  placeholder="1.0.0"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Release Notes</label>
                <Input
                  value={versionForm.releaseNotes}
                  onChange={(e) => setVersionForm((f) => ({ ...f, releaseNotes: e.target.value }))}
                  placeholder="Bug fixes and improvements"
                  className="mt-1"
                />
              </div>
            </div>
            {uploading && (
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleUpload} disabled={uploading || !selectedFile || !versionForm.version}>
                {uploading ? "Uploading..." : "Upload"}
              </Button>
              <Button variant="outline" onClick={() => { setShowUpload(false); setSelectedFile(null); }}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      <DataTable columns={versionColumns} data={versions} pageSize={5} />
    </div>
  );
}

// --- Assignments Tab ---

function AssignmentsTab({ appId }: { appId: string }) {
  const [assignments, setAssignments] = React.useState<AppAssignment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ targetType: "device" as "device" | "group", targetId: "", installType: "optional" });

  const fetchAssignments = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: AppAssignment[] }>(`/apps/${appId}/assignments`);
      setAssignments(res.data);
    } catch {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  React.useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const handleCreate = async () => {
    if (!form.targetId) return;
    try {
      const body: Record<string, string> = { installType: form.installType };
      if (form.targetType === "device") body.deviceId = form.targetId;
      else body.groupId = form.targetId;
      await api.post(`/apps/${appId}/assignments`, body);
      setShowCreate(false);
      setForm({ targetType: "device", targetId: "", installType: "optional" });
      fetchAssignments();
    } catch (e) {
      console.error("Failed to create assignment:", e);
    }
  };

  const handleDelete = async (assignmentId: string) => {
    try {
      await api.delete(`/apps/${appId}/assignments/${assignmentId}`);
      fetchAssignments();
    } catch (e) {
      console.error("Failed to delete assignment:", e);
    }
  };

  const installTypeBadge = (type: string) => {
    switch (type) {
      case "required":
        return <Badge className="bg-blue-100 text-blue-800">Required</Badge>;
      case "prohibited":
        return <Badge className="bg-red-100 text-red-800">Prohibited</Badge>;
      default:
        return <Badge variant="secondary">Optional</Badge>;
    }
  };

  const assignmentColumns: Column<AppAssignment>[] = [
    {
      key: "target",
      header: "Target",
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.deviceId ? <Monitor className="h-4 w-4" /> : <Users className="h-4 w-4" />}
          <span>{row.deviceId ? `Device: ${row.deviceId.slice(0, 8)}...` : `Group: ${row.groupId?.slice(0, 8)}...`}</span>
        </div>
      ),
    },
    {
      key: "installType",
      header: "Install Type",
      render: (row) => installTypeBadge(row.installType),
    },
    {
      key: "createdAt",
      header: "Assigned",
      render: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Button variant="outline" size="sm" onClick={() => handleDelete(row.id)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Assignments</h3>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Assign
        </Button>
      </div>

      {showCreate && (
        <Card className="p-4 space-y-4">
          <h4 className="font-medium">New Assignment</h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Type</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.targetType}
                onChange={(e) => setForm((f) => ({ ...f, targetType: e.target.value as "device" | "group" }))}
              >
                <option value="device">Device</option>
                <option value="group">Group</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{form.targetType === "device" ? "Device ID" : "Group ID"}</label>
              <Input
                value={form.targetId}
                onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}
                placeholder="Enter UUID..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Install Type</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.installType}
                onChange={(e) => setForm((f) => ({ ...f, installType: e.target.value }))}
              >
                <option value="required">Required</option>
                <option value="optional">Optional</option>
                <option value="prohibited">Prohibited</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={!form.targetId}>Assign</Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      <DataTable columns={assignmentColumns} data={assignments} pageSize={10} />
    </div>
  );
}

// --- Install Status Tab ---

interface InstallStatus {
  id: string;
  deviceId: string;
  deviceName: string;
  status: string;
  version: string;
  updatedAt: string;
  [key: string]: unknown;
}

function InstallStatusTab({ appId }: { appId: string }) {
  // Install status would come from device heartbeat data correlated with assignments
  const statusData: InstallStatus[] = [];

  const statusBadge = (status: string) => {
    switch (status) {
      case "installed":
        return <Badge className="bg-green-100 text-green-800">Installed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const statusColumns: Column<InstallStatus>[] = [
    {
      key: "deviceName",
      header: "Device",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-muted-foreground" />
          <span>{row.deviceName}</span>
        </div>
      ),
    },
    { key: "version", header: "Version" },
    {
      key: "status",
      header: "Status",
      render: (row) => statusBadge(row.status),
    },
    {
      key: "updatedAt",
      header: "Last Updated",
      render: (row) => new Date(row.updatedAt).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Install Status by Device</h3>
      <DataTable
        columns={statusColumns}
        data={statusData}
        searchKey="deviceName"
        searchPlaceholder="Search devices..."
      />
    </div>
  );
}
