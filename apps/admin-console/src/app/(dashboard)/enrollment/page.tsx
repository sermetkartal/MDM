"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { QrCode, Link2, Smartphone, Nfc, Settings } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import type { EnrollmentConfig, EnrollmentQrResponse, CreateEnrollmentConfigRequest } from "@/lib/types";

export default function EnrollmentPage() {
  const [configName, setConfigName] = React.useState("Default Enrollment");
  const [expiresInHours, setExpiresInHours] = React.useState(24);
  const [generatedConfigId, setGeneratedConfigId] = React.useState<string | null>(null);
  const [expiryTime, setExpiryTime] = React.useState<Date | null>(null);
  const [countdown, setCountdown] = React.useState("");

  const createConfig = useMutation({
    mutationFn: (req: CreateEnrollmentConfigRequest) =>
      api.post<EnrollmentConfig>("/v1/enrollment/configs", req),
    onSuccess: (config) => {
      setGeneratedConfigId(config.id);
      if (config.expiresAt) {
        setExpiryTime(new Date(config.expiresAt));
      }
    },
  });

  const { data: qrData } = useQuery({
    queryKey: ["enrollment", "qr", generatedConfigId],
    queryFn: () => api.get<EnrollmentQrResponse>(`/v1/enrollment/qr-code/${generatedConfigId}`),
    enabled: !!generatedConfigId,
  });

  // Countdown timer
  React.useEffect(() => {
    if (!expiryTime) return;
    const interval = setInterval(() => {
      const diff = expiryTime.getTime() - Date.now();
      if (diff <= 0) {
        setCountdown("Expired");
        clearInterval(interval);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiryTime]);

  const handleGenerateQR = () => {
    const expiresAt = new Date(Date.now() + expiresInHours * 3600000).toISOString();
    createConfig.mutate({ name: configName, expiresAt });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enrollment"
        description="Configure enrollment methods and onboard new devices"
      />

      {/* Method Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <MethodCard
          icon={QrCode}
          title="QR Code"
          description="Generate a QR code for quick device provisioning via Android Enterprise."
        />
        <MethodCard
          icon={Nfc}
          title="NFC"
          description="Tap-to-enroll using NFC for supported devices."
        />
        <MethodCard
          icon={Settings}
          title="Zero-Touch"
          description="Pre-configure devices for automatic enrollment when powered on."
        />
        <MethodCard
          icon={Smartphone}
          title="Samsung Knox"
          description="Knox Mobile Enrollment for Samsung devices."
        />
        <MethodCard
          icon={Link2}
          title="Manual"
          description="Manual enrollment via enrollment URL or email invitation."
        />
        <MethodCard
          icon={Smartphone}
          title="Apple DEP"
          description="Automatic enrollment via Apple Business Manager / Device Enrollment Program."
        />
      </div>

      {/* QR Code Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">QR Code Enrollment</CardTitle>
          <CardDescription>Generate a QR code to enroll new devices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Configuration Name</label>
              <Input
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="Enrollment config name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Expires In (hours)</label>
              <Input
                type="number"
                min={1}
                max={720}
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(Number(e.target.value))}
              />
            </div>
          </div>
          <Button onClick={handleGenerateQR} disabled={createConfig.isPending}>
            {createConfig.isPending ? "Generating..." : "Generate Enrollment QR"}
          </Button>

          {qrData && (
            <div className="mt-6 flex flex-col items-center gap-4 rounded-lg border p-6">
              {/* QR code rendered as a simple canvas-based pattern */}
              <QrCodeDisplay data={qrData.qrData} />
              <div className="text-center">
                <p className="text-sm font-medium">Enrollment URL</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">{qrData.qrData}</p>
                {countdown && (
                  <p className="mt-2 text-sm">
                    Expires in: <span className="font-mono font-medium">{countdown}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apple DEP Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apple DEP / Business Manager</CardTitle>
          <CardDescription>Configure Device Enrollment Program for automatic iOS enrollment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            <Smartphone className="mx-auto mb-2 h-8 w-8" />
            <p>DEP enrollment requires Apple Business Manager integration.</p>
            <p className="mt-1">
              Upload your DEP server token in{" "}
              <a href="/settings/apple" className="text-primary underline">
                Apple MDM Settings
              </a>{" "}
              to enable automatic enrollment.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Default DEP Profile</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select a DEP profile...</option>
                <option value="default">Default - Supervised, Skip Setup</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Assign to Group</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select a group...</option>
              </select>
            </div>
          </div>
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Save DEP Configuration
          </Button>
        </CardContent>
      </Card>

      {/* Zero-Touch Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zero-Touch Configuration</CardTitle>
          <CardDescription>Configure Google Zero-Touch portal settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Enterprise ID</label>
            <Input placeholder="Your Google enterprise ID" />
          </div>
          <div>
            <label className="text-sm font-medium">Service Account Email</label>
            <Input placeholder="service-account@project.iam.gserviceaccount.com" />
          </div>
          <div>
            <label className="text-sm font-medium">Default Policy</label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select a policy...</option>
            </select>
          </div>
          <Button variant="outline">Save Zero-Touch Config</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function MethodCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function QrCodeDisplay({ data }: { data: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 200;
    canvas.width = size;
    canvas.height = size;

    // Simple visual representation - in production, use a QR library
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";

    // Generate a deterministic pattern from the data string
    const cellSize = 8;
    const gridSize = Math.floor(size / cellSize);
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const charCode = data.charCodeAt((y * gridSize + x) % data.length);
        if (charCode % 3 !== 0) {
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }

    // Draw finder patterns (top-left, top-right, bottom-left)
    const drawFinder = (ox: number, oy: number) => {
      ctx.fillStyle = "#000000";
      ctx.fillRect(ox, oy, 56, 56);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(ox + 8, oy + 8, 40, 40);
      ctx.fillStyle = "#000000";
      ctx.fillRect(ox + 16, oy + 16, 24, 24);
    };
    drawFinder(0, 0);
    drawFinder(size - 56, 0);
    drawFinder(0, size - 56);
  }, [data]);

  return <canvas ref={canvasRef} className="rounded border" />;
}
