"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, MapPin, Circle, Pentagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Geofence } from "@/lib/types";

export default function GeofencingPage() {
  const geofences: Geofence[] = [
    { id: "gf1", orgId: "org1", name: "Headquarters", description: null, type: "circle", centerLat: "41.0082", centerLng: "28.9784", radiusMeters: 500, polygon: null, dwellTimeSeconds: 0, isActive: true, createdAt: "2024-06-01T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z" },
    { id: "gf2", orgId: "org1", name: "Warehouse Zone", description: null, type: "polygon", centerLat: "41.01", centerLng: "28.97", radiusMeters: 0, polygon: [{ lat: 41.01, lng: 28.96 }, { lat: 41.02, lng: 28.97 }, { lat: 41.01, lng: 28.98 }], dwellTimeSeconds: 300, isActive: true, createdAt: "2024-07-01T00:00:00Z", updatedAt: "2024-07-01T00:00:00Z" },
    { id: "gf3", orgId: "org1", name: "Restricted Area", description: null, type: "circle", centerLat: "41.015", centerLng: "28.985", radiusMeters: 200, polygon: null, dwellTimeSeconds: 0, isActive: false, createdAt: "2024-08-01T00:00:00Z", updatedAt: "2024-08-01T00:00:00Z" },
  ];
  const isLoading = false;

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
          <div className="h-[500px] bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
            Map Preview
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
