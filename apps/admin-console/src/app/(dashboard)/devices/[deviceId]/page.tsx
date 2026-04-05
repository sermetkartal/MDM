"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Smartphone,
  Battery,
  HardDrive,
  Cpu,
  Shield,
  Lock,
  MapPin,
  Monitor,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DeviceStatusBadge } from "@/components/devices/DeviceStatusBadge";
import { ComplianceBadge } from "@/components/devices/ComplianceBadge";
import { RemoteActionsPanel } from "@/components/devices/RemoteActionsPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// import { useDevice, useDevicePolicies, useDeviceApps, useDeviceCompliance } from "@/hooks/queries/use-devices";
import { formatDate, formatRelativeTime } from "@/lib/utils";

function CircularProgress({ value, label, color }: { value: number; label: string; color: string }) {
  const radius = 36;
  const { circumference, offset } = React.useMemo(() => {
    const circ = 2 * Math.PI * radius;
    return { circumference: circ, offset: circ - (value / 100) * circ };
  }, [value]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-24 w-24">
        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
          <circle
            cx="40" cy="40" r={radius} fill="none"
            stroke={color} strokeWidth="6"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold">{value}%</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{typeof value === "string" ? value : value}</p>
    </div>
  );
}

export default function DeviceDetailPage() {
  const params = useParams();
  const deviceId = params.deviceId as string;

  const [activeTab, setActiveTab] = React.useState("overview");

  // Dummy data replacing API hooks
  const device = {
    id: deviceId, serialNumber: "WH-001", udid: "abc-123-def", name: "WH-001",
    model: "Galaxy Tab A8", manufacturer: "Samsung",
    osVersion: "Android 14", platform: "android",
    status: "enrolled", complianceStatus: "compliant",
    lastSeenAt: new Date().toISOString(),
    enrolledAt: "2024-06-15T10:30:00Z",
    createdAt: "2024-06-15T10:30:00Z",
    deviceInfo: {
      batteryLevel: 78, storageUsedPercent: 36, memoryUsedPercent: 56,
      encrypted: true, rooted: false, screenLock: true,
      latitude: 41.0082, longitude: 28.9784,
    },
  };
  const isLoading = false;

  const policies = [
    { assignmentId: "pa1", policyName: "WiFi Restriction", platform: "android", version: 3, assignedAt: "2024-07-01T00:00:00Z" },
    { assignmentId: "pa2", policyName: "Passcode Policy", platform: "android", version: 2, assignedAt: "2024-07-05T00:00:00Z" },
  ];
  const apps = [
    { assignmentId: "aa1", appName: "MDM Agent", bundleId: "com.mdm.agent", isRequired: true, assignedAt: "2024-06-15T00:00:00Z" },
    { assignmentId: "aa2", appName: "Chrome", bundleId: "com.chrome.browser", isRequired: false, assignedAt: "2024-06-20T00:00:00Z" },
    { assignmentId: "aa3", appName: "Settings", bundleId: "com.android.settings", isRequired: true, assignedAt: "2024-06-15T00:00:00Z" },
  ];

  const deviceInfo = (device.deviceInfo ?? {}) as Record<string, unknown>;
  const batteryLevel = (deviceInfo.batteryLevel as number) ?? 0;
  const storageUsed = (deviceInfo.storageUsedPercent as number) ?? 0;
  const memoryUsed = (deviceInfo.memoryUsedPercent as number) ?? 0;
  const isEncrypted = (deviceInfo.encrypted as boolean) ?? false;
  const isRooted = (deviceInfo.rooted as boolean) ?? false;
  const hasScreenLock = (deviceInfo.screenLock as boolean) ?? true;
  const lastLatitude = deviceInfo.latitude as number | undefined;
  const lastLongitude = deviceInfo.longitude as number | undefined;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!device) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Device not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/devices">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {device.name ?? device.serialNumber ?? device.udid}
            </h1>
            <DeviceStatusBadge status={device.status} />
            <ComplianceBadge status={device.complianceStatus} />
          </div>
          <p className="text-sm text-muted-foreground">
            {device.manufacturer} {device.model} &middot; Enrolled {device.enrolledAt ? formatDate(device.enrolledAt) : "N/A"}
          </p>
        </div>
      </div>

      {/* Remote Actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Remote Actions</CardTitle>
            <Link href={`/devices/${deviceId}/remote-view`}>
              <Button variant="outline" size="sm">
                <Monitor className="mr-2 h-4 w-4" />
                Remote View
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <RemoteActionsPanel deviceId={deviceId} />
        </CardContent>
      </Card>

      {/* Quick Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Platform</p>
              <p className="text-sm font-medium">{device.platform} {device.osVersion}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Battery className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Battery</p>
              <p className="text-sm font-medium">{batteryLevel}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Compliance</p>
              <ComplianceBadge status={device.complianceStatus} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Last Seen</p>
              <p className="text-sm font-medium">
                {device.lastSeenAt ? formatRelativeTime(device.lastSeenAt) : "Never"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="apps">Apps</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="telemetry">
            <Link href={`/devices/${deviceId}/telemetry`}>Telemetry</Link>
          </TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Hardware Gauges */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hardware Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-around">
                  <CircularProgress value={batteryLevel} label="Battery" color="#22c55e" />
                  <CircularProgress value={storageUsed} label="Storage" color="#3b82f6" />
                  <CircularProgress value={memoryUsed} label="Memory" color="#f59e0b" />
                </div>
              </CardContent>
            </Card>

            {/* Security State */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Security</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Encryption</span>
                  <Badge variant={isEncrypted ? "success" : "destructive"}>
                    {isEncrypted ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm">Root/Jailbreak</span>
                  <Badge variant={isRooted ? "destructive" : "success"}>
                    {isRooted ? "Detected" : "Clean"}
                  </Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm">Screen Lock</span>
                  <Badge variant={hasScreenLock ? "success" : "destructive"}>
                    {hasScreenLock ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Device Info */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Device Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <InfoRow label="Serial Number" value={device.serialNumber ?? "N/A"} />
                  <InfoRow label="UDID" value={device.udid} />
                  <InfoRow label="Manufacturer" value={device.manufacturer ?? "N/A"} />
                  <InfoRow label="Model" value={device.model ?? "N/A"} />
                  <InfoRow label="OS Version" value={device.osVersion ?? "N/A"} />
                  <InfoRow label="Platform" value={device.platform} />
                  <InfoRow label="Enrolled" value={device.enrolledAt ? formatDate(device.enrolledAt) : "N/A"} />
                  <InfoRow label="Last Seen" value={device.lastSeenAt ? formatRelativeTime(device.lastSeenAt) : "Never"} />
                </div>
              </CardContent>
            </Card>

            {/* iOS-specific info */}
            {((device.platform as string) === "ios" || (device.platform as string) === "ipados") && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">iOS Device Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <InfoRow label="Supervision" value={
                      <Badge variant={(deviceInfo.supervised as boolean) ? "default" : "secondary"}>
                        {(deviceInfo.supervised as boolean) ? "Supervised" : "Unsupervised"}
                      </Badge>
                    } />
                    <InfoRow label="DEP Enrolled" value={
                      <Badge variant={(deviceInfo.depEnrolled as boolean) ? "default" : "secondary"}>
                        {(deviceInfo.depEnrolled as boolean) ? "Yes" : "No"}
                      </Badge>
                    } />
                    <InfoRow label="Model Name" value={(deviceInfo.modelName as string) ?? "N/A"} />
                    <InfoRow label="Build Version" value={(deviceInfo.buildVersion as string) ?? "N/A"} />
                    <InfoRow label="IMEI" value={(deviceInfo.imei as string) ?? "N/A"} />
                    <InfoRow label="Activation Lock" value={
                      <Badge variant={(deviceInfo.activationLocked as boolean) ? "destructive" : "success"}>
                        {(deviceInfo.activationLocked as boolean) ? "Enabled" : "Disabled"}
                      </Badge>
                    } />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Apps Tab */}
        <TabsContent value="apps">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Installed Applications ({apps.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {apps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No app data available.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>App Name</TableHead>
                      <TableHead>Bundle ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Assigned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apps.map((app) => (
                      <TableRow key={app.assignmentId}>
                        <TableCell className="font-medium">{app.appName}</TableCell>
                        <TableCell className="font-mono text-xs">{app.bundleId}</TableCell>
                        <TableCell>
                          <Badge variant={app.isRequired ? "default" : "secondary"}>
                            {app.isRequired ? "Required" : "Optional"}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(app.assignedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Policies Tab */}
        <TabsContent value="policies">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Applied Policies ({policies.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {policies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No policies assigned.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy Name</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Assigned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policies.map((policy) => (
                      <TableRow key={policy.assignmentId}>
                        <TableCell className="font-medium">{policy.policyName}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{policy.platform}</Badge>
                        </TableCell>
                        <TableCell>v{policy.version}</TableCell>
                        <TableCell>{formatDate(policy.assignedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Location Tab */}
        <TabsContent value="location">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Device Location</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-64 items-center justify-center rounded-md border border-dashed bg-muted/50">
                <div className="text-center">
                  <MapPin className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">Map View</p>
                  {lastLatitude !== undefined && lastLongitude !== undefined ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last known: {lastLatitude.toFixed(6)}, {lastLongitude.toFixed(6)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No location data available
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Event Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {device.enrolledAt && (
                  <TimelineItem
                    timestamp={device.enrolledAt}
                    title="Device Enrolled"
                    description={`${device.name ?? device.udid} was enrolled via ${device.platform}`}
                  />
                )}
                {device.lastSeenAt && (
                  <TimelineItem
                    timestamp={device.lastSeenAt}
                    title="Last Heartbeat"
                    description="Device checked in with the MDM server"
                  />
                )}
                <TimelineItem
                  timestamp={device.createdAt}
                  title="Device Record Created"
                  description="Device record was created in the system"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TimelineItem({ timestamp, title, description }: { timestamp: string; title: string; description: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="h-2 w-2 rounded-full bg-primary" />
        <div className="w-px flex-1 bg-border" />
      </div>
      <div className="pb-4">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        <p className="mt-1 text-xs text-muted-foreground">{formatDate(timestamp)}</p>
      </div>
    </div>
  );
}
