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
import { Separator } from "@/components/ui/separator";
import {
  Download,
  Copy,
  CheckCircle2,
  Smartphone,
  QrCode,
  Package,
  Settings2,
  Terminal,
  FileJson,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Very small deterministic hash used to derive the QR grid pattern. */
function simpleHash(str: string): number[] {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  const out: number[] = [];
  for (let i = 0; i < 625; i++) {
    h = (h * 16807 + 7) | 0;
    out.push(Math.abs(h) % 2);
  }
  // Ensure the three finder patterns (top-left, top-right, bottom-left) are set
  const setFinder = (rStart: number, cStart: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const idx = (rStart + r) * 25 + (cStart + c);
        const isBorder =
          r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        out[idx] = isBorder || isInner ? 1 : 0;
      }
    }
  };
  setFinder(0, 0);
  setFinder(0, 18);
  setFinder(18, 0);
  return out;
}

function getHostname(): string {
  if (typeof window !== "undefined") {
    return window.location.hostname || "localhost";
  }
  return "localhost";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BuildType = "debug" | "release";
type KioskMode = "none" | "single_app" | "multi_app";

interface AgentConfig {
  serverUrl: string;
  enrollmentUrl: string;
  grpcUrl: string;
  orgName: string;
  enrollmentToken: string;
  packageName: string;
  agentVersion: string;
  buildType: BuildType;
  enrollmentModes: string[];
  kioskMode: KioskMode;
  remoteControl: boolean;
  locationTracking: boolean;
  heartbeatInterval: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ApkBuilderPage() {
  const hostname = getHostname();

  const [config, setConfig] = React.useState<AgentConfig>({
    serverUrl: `http://${hostname}:3005`,
    enrollmentUrl: `http://${hostname}:3005/api/v1/enrollment`,
    grpcUrl: `${hostname}:50051`,
    orgName: "",
    enrollmentToken: generateUUID(),
    packageName: "com.mdm.agent",
    agentVersion: "1.0.0",
    buildType: "release",
    enrollmentModes: ["qr_code", "manual"],
    kioskMode: "none",
    remoteControl: true,
    locationTracking: true,
    heartbeatInterval: 60,
  });

  const [saved, setSaved] = React.useState(false);
  const [copiedField, setCopiedField] = React.useState<string | null>(null);
  const [buildStatus, setBuildStatus] = React.useState<
    "idle" | "building" | "done"
  >("idle");
  const [buildStep, setBuildStep] = React.useState(0);
  const [instructionsOpen, setInstructionsOpen] = React.useState(false);

  // Helpers to update config fields
  const set = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const toggleEnrollmentMode = (mode: string) => {
    setConfig((prev) => {
      const modes = prev.enrollmentModes.includes(mode)
        ? prev.enrollmentModes.filter((m) => m !== mode)
        : [...prev.enrollmentModes, mode];
      return { ...prev, enrollmentModes: modes };
    });
  };

  // Build the JSON payload
  const buildConfigJson = () => ({
    server_url: config.serverUrl,
    grpc_url: config.grpcUrl,
    enrollment_url: config.enrollmentUrl,
    enrollment_token: config.enrollmentToken,
    org_name: config.orgName,
    package_name: config.packageName,
    build_type: config.buildType,
    enrollment_modes: config.enrollmentModes,
    features: {
      kiosk_mode: config.kioskMode,
      remote_control: config.remoteControl,
      location_tracking: config.locationTracking,
      heartbeat_interval_seconds: config.heartbeatInterval,
    },
  });

  // Copy to clipboard helper
  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Download config JSON
  const downloadConfigJson = () => {
    const json = JSON.stringify(buildConfigJson(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "enrollment_config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download QR as PNG
  const downloadQrPng = () => {
    const json = JSON.stringify(buildConfigJson());
    const grid = simpleHash(json);
    const size = 25;
    const scale = 8;
    const canvas = document.createElement("canvas");
    canvas.width = size * scale;
    canvas.height = size * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r * size + c]) {
          ctx.fillRect(c * scale, r * scale, scale, scale);
        }
      }
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "enrollment-qr.png";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  // Build APK simulation
  const buildSteps = [
    "Injecting configuration...",
    "Compiling Android agent...",
    "Signing APK...",
    "Verifying...",
    "APK Ready!",
  ];

  const startBuild = () => {
    setBuildStatus("building");
    setBuildStep(0);
    const delays = [1000, 2000, 1000, 500];
    let current = 0;
    const advance = () => {
      if (current < delays.length) {
        setTimeout(() => {
          current++;
          setBuildStep(current);
          advance();
        }, delays[current]);
      } else {
        setBuildStatus("done");
      }
    };
    advance();
  };

  const downloadDummyApk = () => {
    const content = `MDM Agent APK v${config.agentVersion}\nBuild type: ${config.buildType}\nPackage: ${config.packageName}\nThis is a placeholder APK for demonstration purposes.\n`;
    const blob = new Blob([content], { type: "application/vnd.android.package-archive" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mdm-agent-v${config.agentVersion}.apk`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Save config
  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // QR grid
  const qrGrid = simpleHash(JSON.stringify(buildConfigJson()));

  // Build instructions
  const instructions = [
    {
      step: "Clone the repository",
      cmd: "git clone https://github.com/your-org/mdm-agent-android.git && cd mdm-agent-android",
    },
    {
      step: "Copy the config JSON to the assets directory",
      cmd: "cp enrollment_config.json clients/android/app/src/main/assets/enrollment_config.json",
    },
    {
      step: "Open the project in Android Studio",
      cmd: "studio clients/android",
    },
    {
      step: "Update build.gradle with your signing key",
      cmd: `// In app/build.gradle, add:\nsigningConfigs {\n    release {\n        storeFile file("keystore.jks")\n        storePassword "your-store-password"\n        keyAlias "your-key-alias"\n        keyPassword "your-key-password"\n    }\n}`,
    },
    {
      step: "Build the release APK",
      cmd: "./gradlew assembleRelease",
    },
    {
      step: "Locate the output APK",
      cmd: "ls -la app/build/outputs/apk/release/app-release.apk",
    },
  ];

  const enrollmentQrFormat = JSON.stringify(
    {
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME":
        `${config.packageName}/.dpc.MdmDeviceAdminReceiver`,
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION":
        `${config.serverUrl}/agent.apk`,
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM":
        "<SHA-256 checksum of the APK>",
      "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
        server_url: config.serverUrl,
        enrollment_token: config.enrollmentToken,
      },
    },
    null,
    2,
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title="Agent APK Builder"
        description="Configure, build, and download a pre-configured MDM agent for Android devices"
        actions={
          <Badge variant="secondary" className="gap-1">
            <Package className="h-3 w-3" />
            v{config.agentVersion}
          </Badge>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Section 1 -- Agent Configuration                                    */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-5 w-5 text-primary" />
            Agent Configuration
          </CardTitle>
          <CardDescription>
            Set the server endpoints and enrollment parameters for your MDM
            agent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Server URL */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">MDM Server URL</label>
              <Input
                value={config.serverUrl}
                onChange={(e) => set("serverUrl", e.target.value)}
                placeholder="http://localhost:3005"
              />
            </div>
            {/* Enrollment URL */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Enrollment Server URL</label>
              <Input
                value={config.enrollmentUrl}
                onChange={(e) => set("enrollmentUrl", e.target.value)}
                placeholder="http://localhost:3005/api/v1/enrollment"
              />
            </div>
            {/* gRPC URL */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">gRPC Server URL</label>
              <Input
                value={config.grpcUrl}
                onChange={(e) => set("grpcUrl", e.target.value)}
                placeholder="localhost:50051"
              />
            </div>
            {/* Organization Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Organization Name</label>
              <Input
                value={config.orgName}
                onChange={(e) => set("orgName", e.target.value)}
                placeholder="My Company"
              />
            </div>
            {/* Enrollment Token */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Enrollment Token</label>
              <div className="flex gap-2">
                <Input
                  value={config.enrollmentToken}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => set("enrollmentToken", generateUUID())}
                  title="Regenerate token"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {/* Package Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Agent Package Name</label>
              <Input
                value={config.packageName}
                onChange={(e) => set("packageName", e.target.value)}
                placeholder="com.mdm.agent"
              />
            </div>
            {/* Agent Version */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Agent Version</label>
              <Input
                value={config.agentVersion}
                onChange={(e) => set("agentVersion", e.target.value)}
                placeholder="1.0.0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2 -- APK Build Options                                      */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-5 w-5 text-primary" />
            APK Build Options
          </CardTitle>
          <CardDescription>
            Choose build type, enrollment modes, and feature flags
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Build Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Build Type</label>
            <div className="flex gap-2">
              {(["debug", "release"] as BuildType[]).map((t) => (
                <Button
                  key={t}
                  variant={config.buildType === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => set("buildType", t)}
                  className="capitalize"
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Enrollment Modes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Enrollment Modes</label>
            <div className="flex flex-wrap gap-3">
              {[
                { id: "qr_code", label: "QR Code" },
                { id: "nfc", label: "NFC" },
                { id: "zero_touch", label: "Zero-Touch" },
                { id: "knox", label: "Knox" },
                { id: "manual", label: "Manual" },
              ].map((mode) => (
                <label
                  key={mode.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={config.enrollmentModes.includes(mode.id)}
                    onChange={() => toggleEnrollmentMode(mode.id)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  {mode.label}
                </label>
              ))}
            </div>
          </div>

          <Separator />

          {/* Kiosk Mode */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Default Kiosk Mode</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={config.kioskMode}
                onChange={(e) => set("kioskMode", e.target.value as KioskMode)}
              >
                <option value="none">None</option>
                <option value="single_app">Single App</option>
                <option value="multi_app">Multi App</option>
              </select>
            </div>

            {/* Remote Control */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Enable Remote Control</label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.remoteControl}
                  onChange={(e) => set("remoteControl", e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {config.remoteControl ? "Enabled" : "Disabled"}
              </label>
            </div>

            {/* Location Tracking */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Enable Location Tracking
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.locationTracking}
                  onChange={(e) => set("locationTracking", e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {config.locationTracking ? "Enabled" : "Disabled"}
              </label>
            </div>

            {/* Heartbeat */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Heartbeat Interval (seconds)
              </label>
              <Input
                type="number"
                min={10}
                max={3600}
                value={config.heartbeatInterval}
                onChange={(e) =>
                  set("heartbeatInterval", Number(e.target.value))
                }
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-3">
            <Button onClick={handleSave}>
              <Settings2 className="mr-2 h-4 w-4" />
              Save Configuration
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Configuration saved
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3 -- Quick Actions                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Card A -- Download Config JSON */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileJson className="h-5 w-5 text-blue-500" />
              Download Config JSON
            </CardTitle>
            <CardDescription>
              Generate the enrollment configuration file for the Android agent
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto space-y-3">
            <Button className="w-full" onClick={downloadConfigJson}>
              <Download className="mr-2 h-4 w-4" />
              Generate &amp; Download Config
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                copyToClipboard(
                  JSON.stringify(buildConfigJson(), null, 2),
                  "config",
                )
              }
            >
              {copiedField === "config" ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy JSON to Clipboard
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Card B -- Generate QR Code */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-5 w-5 text-violet-500" />
              Generate QR Code
            </CardTitle>
            <CardDescription>
              Enrollment QR code for Android device setup
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {/* QR visual */}
            <div className="rounded-lg border-2 bg-white p-3">
              <div
                className="grid"
                style={{
                  gridTemplateColumns: "repeat(25, 6px)",
                  gridTemplateRows: "repeat(25, 6px)",
                  gap: "0px",
                }}
              >
                {qrGrid.map((v, i) => (
                  <div
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: v ? "#000" : "#fff",
                    }}
                  />
                ))}
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Scan this QR code during Android device setup (tap 6 times on the
              welcome screen)
            </p>
            <div className="flex w-full gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() =>
                  copyToClipboard(
                    JSON.stringify(buildConfigJson(), null, 2),
                    "qr-data",
                  )
                }
              >
                {copiedField === "qr-data" ? (
                  <>
                    <CheckCircle2 className="mr-2 h-3 w-3 text-emerald-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-3 w-3" />
                    Copy QR Data
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={downloadQrPng}
              >
                <Download className="mr-2 h-3 w-3" />
                Download PNG
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Card C -- Build APK */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-5 w-5 text-orange-500" />
              Build APK
            </CardTitle>
            <CardDescription>
              Compile the agent APK with your configuration baked in
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto space-y-4">
            {buildStatus === "idle" && (
              <Button className="w-full" onClick={startBuild}>
                <Terminal className="mr-2 h-4 w-4" />
                Build APK
              </Button>
            )}

            {buildStatus === "building" && (
              <div className="space-y-2">
                {buildSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 text-sm ${
                      idx < buildStep
                        ? "text-emerald-600"
                        : idx === buildStep
                          ? "text-foreground font-medium"
                          : "text-muted-foreground/50"
                    }`}
                  >
                    {idx < buildStep ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : idx === buildStep ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <div className="h-4 w-4 shrink-0" />
                    )}
                    {step}
                  </div>
                ))}
              </div>
            )}

            {buildStatus === "done" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Build complete
                </div>
                <Button className="w-full" onClick={downloadDummyApk}>
                  <Download className="mr-2 h-4 w-4" />
                  Download MDM Agent APK (42.3 MB)
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  size="sm"
                  onClick={() => {
                    setBuildStatus("idle");
                    setBuildStep(0);
                  }}
                >
                  Rebuild
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 4 -- Manual Build Instructions                              */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setInstructionsOpen((o) => !o)}
        >
          <CardTitle className="flex items-center gap-2 text-base">
            {instructionsOpen ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            )}
            <Terminal className="h-5 w-5 text-primary" />
            Manual Build Instructions
          </CardTitle>
          <CardDescription>
            Step-by-step guide for building the APK from source
          </CardDescription>
        </CardHeader>
        {instructionsOpen && (
          <CardContent className="space-y-4">
            {instructions.map((inst, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {idx + 1}
                    </span>
                    {inst.step}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(inst.cmd, `step-${idx}`)
                    }
                  >
                    {copiedField === `step-${idx}` ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                  <code>{inst.cmd}</code>
                </pre>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 5 -- Enrollment QR Code Format                              */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-5 w-5 text-primary" />
            Android Enterprise QR Code Format
          </CardTitle>
          <CardDescription>
            The standard provisioning QR code format used by Android Enterprise
            device setup
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            When an admin taps 6 times on the Android welcome screen, the device
            enters provisioning mode and expects a QR code in this format. The
            values below are populated from your current configuration.
          </p>
          <div className="relative">
            <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs">
              <code>{enrollmentQrFormat}</code>
            </pre>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-2"
              onClick={() =>
                copyToClipboard(enrollmentQrFormat, "qr-format")
              }
            >
              {copiedField === "qr-format" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
            <strong>Note:</strong> Replace the{" "}
            <code className="rounded bg-blue-100 px-1 dark:bg-blue-900">
              PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM
            </code>{" "}
            value with the actual SHA-256 checksum of your signed APK. You can
            generate it with:{" "}
            <code className="rounded bg-blue-100 px-1 dark:bg-blue-900">
              cat app-release.apk | openssl dgst -binary -sha256 | openssl
              base64 | tr &apos;+/&apos; &apos;-_&apos; | tr -d &apos;=&apos;
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
