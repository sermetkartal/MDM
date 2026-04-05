"use client";

import * as React from "react";
import { PageHeader } from "@/components/common/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  TestTube,
  Key,
  Cloud,
  Bell,
  Shield,
  Globe,
  Smartphone,
  Eye,
  EyeOff,
  Upload,
  RefreshCw,
  Mail,
  Database,
  Lock,
  Video,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "email" | "textarea" | "file" | "select" | "checkbox";
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  accept?: string;
  helpText?: string;
}

interface ServiceSection {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  fields: FieldDef[];
  testButton?: { label: string };
  syncButton?: boolean;
}

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

const sections: ServiceSection[] = [
  {
    id: "fcm",
    title: "Firebase Cloud Messaging (FCM)",
    description:
      "Push notifications for Android devices via Firebase Cloud Messaging.",
    icon: Bell,
    fields: [
      { key: "projectId", label: "Firebase Project ID", type: "text", placeholder: "my-mdm-project", required: true },
      { key: "serviceAccountJson", label: "FCM Service Account JSON", type: "textarea", placeholder: "Paste your Firebase service account JSON here...", required: true, helpText: "The full JSON key file downloaded from the Firebase console." },
      { key: "senderId", label: "FCM Sender ID", type: "text", placeholder: "123456789012", required: true },
    ],
    testButton: { label: "Send Test Push" },
  },
  {
    id: "playIntegrity",
    title: "Google Play Integrity API",
    description: "Device attestation for Android via the Play Integrity API.",
    icon: Shield,
    fields: [
      { key: "gcpProjectId", label: "Google Cloud Project ID", type: "text", placeholder: "my-gcp-project", required: true },
      { key: "serviceAccountJson", label: "Service Account JSON", type: "textarea", placeholder: "Paste GCP service account JSON...", required: true },
      { key: "packageName", label: "Android Agent Package Name", type: "text", placeholder: "com.mdm.agent", defaultValue: "com.mdm.agent", required: true },
    ],
  },
  {
    id: "apns",
    title: "Apple Push Notification Service (APNs)",
    description:
      "Push notifications for iOS / macOS devices via APNs.",
    icon: Smartphone,
    fields: [
      { key: "authKeyP8", label: "APNs Auth Key (.p8)", type: "file", accept: ".p8", required: true, helpText: "Upload the .p8 key file from your Apple Developer account." },
      { key: "keyId", label: "Key ID", type: "text", placeholder: "ABC123DEFG", required: true },
      { key: "teamId", label: "Team ID", type: "text", placeholder: "ABCDE12345", required: true },
      { key: "bundleId", label: "Bundle ID", type: "text", placeholder: "com.mdm.agent.ios", defaultValue: "com.mdm.agent.ios", required: true },
      { key: "environment", label: "Environment", type: "select", required: true, defaultValue: "production", options: [{ label: "Sandbox", value: "sandbox" }, { label: "Production", value: "production" }] },
    ],
    testButton: { label: "Send Test Push" },
  },
  {
    id: "dep",
    title: "Apple Business Manager / DEP",
    description:
      "Device Enrollment Program for zero-touch iOS/macOS provisioning.",
    icon: Globe,
    fields: [
      { key: "depServerToken", label: "DEP Server Token (.p7m)", type: "file", accept: ".p7m", required: true, helpText: "Upload the server token downloaded from Apple Business Manager." },
      { key: "mdmServerUrl", label: "MDM Server URL", type: "text", placeholder: "https://mdm.example.com", required: true, helpText: "Auto-filled from your current server address." },
      { key: "organizationName", label: "Organization Name", type: "text", placeholder: "Acme Corp", required: true },
    ],
    syncButton: true,
  },
  {
    id: "zeroTouch",
    title: "Google Zero-Touch Enrollment",
    description:
      "Zero-touch enrollment for corporate Android devices.",
    icon: Smartphone,
    fields: [
      { key: "customerId", label: "Customer ID", type: "text", placeholder: "C0xxxxxxx", required: true },
      { key: "serviceAccountJson", label: "Service Account JSON", type: "textarea", placeholder: "Paste service account JSON...", required: true },
    ],
  },
  {
    id: "knox",
    title: "Samsung Knox Mobile Enrollment",
    description:
      "Knox Mobile Enrollment for Samsung device provisioning.",
    icon: Key,
    fields: [
      { key: "apiKey", label: "Knox API Key", type: "text", placeholder: "Enter Knox API key", required: true },
      { key: "resellerId", label: "Reseller ID", type: "text", placeholder: "Enter reseller ID", required: true },
    ],
  },
  {
    id: "smtp",
    title: "SMTP Email Configuration",
    description:
      "Outbound email for alerts, reports, and enrollment invitations.",
    icon: Mail,
    fields: [
      { key: "host", label: "SMTP Host", type: "text", placeholder: "smtp.example.com", required: true },
      { key: "port", label: "SMTP Port", type: "number", placeholder: "587", defaultValue: "587", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "noreply@example.com", required: true },
      { key: "password", label: "Password", type: "password", required: true },
      { key: "fromAddress", label: "From Address", type: "email", placeholder: "noreply@example.com", required: true },
      { key: "useTls", label: "Use TLS", type: "checkbox", defaultValue: "true" },
    ],
    testButton: { label: "Send Test Email" },
  },
  {
    id: "s3",
    title: "S3 / MinIO Object Storage",
    description:
      "File storage for profiles, packages, and device backups.",
    icon: Database,
    fields: [
      { key: "endpoint", label: "Endpoint URL", type: "text", placeholder: "http://localhost:9010", defaultValue: "http://localhost:9010", required: true },
      { key: "accessKey", label: "Access Key", type: "text", placeholder: "minioadmin", required: true },
      { key: "secretKey", label: "Secret Key", type: "password", required: true },
      { key: "bucket", label: "Bucket Name", type: "text", placeholder: "mdm-files", defaultValue: "mdm-files", required: true },
      { key: "region", label: "Region", type: "text", placeholder: "us-east-1", defaultValue: "us-east-1" },
      { key: "pathStyle", label: "Use Path Style (MinIO)", type: "checkbox", defaultValue: "true" },
    ],
    testButton: { label: "Test Connection" },
  },
  {
    id: "vault",
    title: "HashiCorp Vault",
    description:
      "Secrets management for certificates, keys, and credentials.",
    icon: Lock,
    fields: [
      { key: "address", label: "Vault Address", type: "text", placeholder: "http://localhost:8200", defaultValue: "http://localhost:8200", required: true },
      { key: "authMethod", label: "Auth Method", type: "select", required: true, defaultValue: "token", options: [{ label: "Token", value: "token" }, { label: "Kubernetes", value: "kubernetes" }, { label: "AppRole", value: "approle" }] },
      { key: "token", label: "Token / Role ID", type: "text", placeholder: "hvs.XXXXXXXXXXXX", required: true },
      { key: "secretId", label: "Secret ID (AppRole)", type: "password", helpText: "Only required when using AppRole auth." },
      { key: "mountPath", label: "Mount Path", type: "text", placeholder: "secret", defaultValue: "secret" },
    ],
    testButton: { label: "Test Connection" },
  },
  {
    id: "turn",
    title: "TURN / STUN Server (WebRTC)",
    description:
      "Relay servers for remote screen viewing and device assistance.",
    icon: Video,
    fields: [
      { key: "stunUrl", label: "STUN Server URL", type: "text", placeholder: "stun:stun.l.google.com:19302", defaultValue: "stun:stun.l.google.com:19302", required: true },
      { key: "turnUrl", label: "TURN Server URL", type: "text", placeholder: "turn:turn.example.com:3478" },
      { key: "turnUsername", label: "TURN Username", type: "text", placeholder: "username" },
      { key: "turnPassword", label: "TURN Password", type: "password" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "mdm-external-services";

function loadAll(): Record<string, Record<string, string>> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSection(sectionId: string, values: Record<string, string>) {
  const all = loadAll();
  all[sectionId] = values;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

// ---------------------------------------------------------------------------
// Status helper
// ---------------------------------------------------------------------------

function getStatus(
  section: ServiceSection,
  values: Record<string, string>,
): "configured" | "partial" | "not-configured" {
  const required = section.fields.filter((f) => f.required);
  if (required.length === 0) return "configured";
  const filled = required.filter((f) => {
    const v = values[f.key];
    return v !== undefined && v !== "";
  });
  if (filled.length === 0) return "not-configured";
  if (filled.length === required.length) return "configured";
  return "partial";
}

function StatusBadge({ status }: { status: "configured" | "partial" | "not-configured" }) {
  if (status === "configured") {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" /> Configured
      </Badge>
    );
  }
  if (status === "partial") {
    return (
      <Badge variant="warning" className="gap-1">
        <XCircle className="h-3 w-3" /> Partial
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" /> Not Configured
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Password field with toggle
// ---------------------------------------------------------------------------

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service Card
// ---------------------------------------------------------------------------

function ServiceCard({ section }: { section: ServiceSection }) {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<"success" | "idle">("idle");
  const [syncing, setSyncing] = React.useState(false);
  const [lastSync, setLastSync] = React.useState<string | null>(null);

  // Load from localStorage on mount
  React.useEffect(() => {
    const all = loadAll();
    const stored = all[section.id] || {};
    // Merge defaults
    const merged: Record<string, string> = {};
    section.fields.forEach((f) => {
      merged[f.key] = stored[f.key] ?? f.defaultValue ?? "";
    });
    setValues(merged);
    if (stored._lastSync) {
      setLastSync(stored._lastSync);
    }
  }, [section.id, section.fields]);

  const updateField = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setTestResult("idle");
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      saveSection(section.id, values);
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 300);
  };

  const handleTest = () => {
    setTesting(true);
    setTestResult("idle");
    setTimeout(() => {
      setTesting(false);
      setTestResult("success");
      setTimeout(() => setTestResult("idle"), 3000);
    }, 1500);
  };

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      const ts = new Date().toISOString();
      setLastSync(ts);
      const all = loadAll();
      all[section.id] = { ...values, _lastSync: ts };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      setSyncing(false);
    }, 2000);
  };

  const handleFileChange = (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateField(key, reader.result as string);
    };
    reader.readAsText(file);
  };

  const status = getStatus(section, values);
  const Icon = section.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {section.fields.map((field) => {
            // Checkbox
            if (field.type === "checkbox") {
              return (
                <label
                  key={field.key}
                  className="flex items-center gap-2 md:col-span-2"
                >
                  <input
                    type="checkbox"
                    checked={values[field.key] === "true"}
                    onChange={(e) =>
                      updateField(field.key, e.target.checked ? "true" : "false")
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="text-sm font-medium">{field.label}</span>
                </label>
              );
            }

            // Textarea (spans 2 cols)
            if (field.type === "textarea") {
              return (
                <div key={field.key} className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium">
                    {field.label}
                    {field.required && <span className="text-destructive"> *</span>}
                  </label>
                  <textarea
                    value={values[field.key] || ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={5}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {field.helpText && (
                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                  )}
                </div>
              );
            }

            // File upload
            if (field.type === "file") {
              return (
                <div key={field.key} className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium">
                    {field.label}
                    {field.required && <span className="text-destructive"> *</span>}
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
                      <Upload className="h-4 w-4" />
                      Choose File
                      <input
                        type="file"
                        accept={field.accept}
                        onChange={(e) => handleFileChange(field.key, e)}
                        className="hidden"
                      />
                    </label>
                    {values[field.key] ? (
                      <span className="text-xs text-muted-foreground">
                        File loaded ({values[field.key].length} chars)
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No file selected</span>
                    )}
                  </div>
                  {field.helpText && (
                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                  )}
                </div>
              );
            }

            // Select
            if (field.type === "select") {
              return (
                <div key={field.key} className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {field.label}
                    {field.required && <span className="text-destructive"> *</span>}
                  </label>
                  <Select
                    value={values[field.key] || ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                  >
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </div>
              );
            }

            // Password
            if (field.type === "password") {
              return (
                <div key={field.key} className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {field.label}
                    {field.required && <span className="text-destructive"> *</span>}
                  </label>
                  <PasswordInput
                    value={values[field.key] || ""}
                    onChange={(v) => updateField(field.key, v)}
                    placeholder={field.placeholder}
                  />
                  {field.helpText && (
                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                  )}
                </div>
              );
            }

            // Default: text, number, email
            return (
              <div key={field.key} className="space-y-1.5">
                <label className="text-sm font-medium">
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </label>
                <Input
                  type={field.type}
                  value={values[field.key] || ""}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                />
                {field.helpText && (
                  <p className="text-xs text-muted-foreground">{field.helpText}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* DEP last sync info */}
        {section.syncButton && lastSync && (
          <p className="text-xs text-muted-foreground">
            Last synced: {new Date(lastSync).toLocaleString()}
          </p>
        )}

        <Separator />

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saved ? "Saved!" : "Save"}
          </Button>

          {section.testButton && (
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="mr-2 h-4 w-4" />
              )}
              {section.testButton.label}
            </Button>
          )}

          {section.syncButton && (
            <Button variant="outline" onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync Now
            </Button>
          )}

          {testResult === "success" && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Connection successful
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ExternalServicesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="External Services"
        description="Configure credentials and endpoints for all external services used by the MDM platform."
      />

      <div className="space-y-6">
        {sections.map((section) => (
          <ServiceCard key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}
