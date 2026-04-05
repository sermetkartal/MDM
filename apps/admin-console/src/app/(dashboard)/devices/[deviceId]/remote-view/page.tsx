"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RemoteViewer } from "@/components/devices/RemoteViewer";
import { useDevice } from "@/hooks/queries/use-devices";
import { DeviceStatusBadge } from "@/components/devices/DeviceStatusBadge";

// These would come from auth context in production
const MOCK_ORG_ID = "00000000-0000-0000-0000-000000000001";
const MOCK_USER_ID = "00000000-0000-0000-0000-000000000002";

export default function RemoteViewPage() {
  const params = useParams();
  const deviceId = params.deviceId as string;
  const { data: device, isLoading } = useDevice(deviceId);

  const handleDisconnect = React.useCallback(() => {
    console.log("Remote session disconnected for device:", deviceId);
  }, [deviceId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/devices/${deviceId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Monitor className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">
              Remote View
            </h1>
            {device && <DeviceStatusBadge status={device.status} />}
          </div>
          {device && (
            <p className="text-sm text-muted-foreground">
              {device.name ?? device.serialNumber ?? device.udid} &middot;{" "}
              {device.manufacturer} {device.model}
            </p>
          )}
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading device...</p>
          )}
        </div>
      </div>

      {/* Remote Viewer */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Screen Share</CardTitle>
        </CardHeader>
        <CardContent>
          <RemoteViewer
            sessionId={null}
            deviceId={deviceId}
            orgId={MOCK_ORG_ID}
            userId={MOCK_USER_ID}
            onDisconnect={handleDisconnect}
          />
        </CardContent>
      </Card>
    </div>
  );
}
