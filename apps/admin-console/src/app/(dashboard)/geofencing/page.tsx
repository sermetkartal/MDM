"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Plus, MapPin, Circle, Pentagon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGeofences } from "@/hooks/queries/use-geofences";
import type { Geofence } from "@/lib/types";

const GeofenceMap = dynamic(
  () => import("@/components/geofencing/GeofenceMap").then((m) => m.GeofenceMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[500px] items-center justify-center rounded-lg border bg-muted/50">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export default function GeofencingPage() {
  const { data, isLoading } = useGeofences();
  const geofences = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[500px]" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Geofencing</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage location-based zones with automated actions
          </p>
        </div>
        <Link href="/geofencing/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Geofence
          </Button>
        </Link>
      </div>

      {/* Map Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Geofence Map</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[500px]">
            <GeofenceMap geofences={geofences} />
          </div>
        </CardContent>
      </Card>

      {/* Geofence List */}
      {geofences.length === 0 ? (
        <Card>
          <CardContent className="flex h-32 items-center justify-center">
            <div className="text-center">
              <MapPin className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No geofences created yet. Create your first geofence to get started.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {geofences.map((fence) => (
            <GeofenceCard key={fence.id} fence={fence} />
          ))}
        </div>
      )}
    </div>
  );
}

function GeofenceCard({ fence }: { fence: Geofence }) {
  return (
    <Link href={`/geofencing/${fence.id}`}>
      <Card className="cursor-pointer transition-shadow hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {fence.type === "circle" ? (
                <Circle className="h-5 w-5 text-blue-500" />
              ) : (
                <Pentagon className="h-5 w-5 text-purple-500" />
              )}
              <div>
                <h3 className="font-medium">{fence.name}</h3>
                <p className="text-xs text-muted-foreground capitalize">{fence.type}</p>
              </div>
            </div>
            <Badge variant={fence.isActive ? "default" : "secondary"}>
              {fence.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            {fence.type === "circle" && (
              <span>Radius: {fence.radiusMeters}m</span>
            )}
            {fence.type === "polygon" && fence.polygon && (
              <span>{fence.polygon.length} points</span>
            )}
            {fence.dwellTimeSeconds > 0 && (
              <span>Dwell: {Math.round(fence.dwellTimeSeconds / 60)}min</span>
            )}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {parseFloat(fence.centerLat).toFixed(4)}, {parseFloat(fence.centerLng).toFixed(4)}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
