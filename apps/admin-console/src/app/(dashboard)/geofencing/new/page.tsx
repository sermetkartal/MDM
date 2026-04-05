"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateGeofence } from "@/hooks/mutations/use-geofence";
import type { GeofencePoint, CreateGeofenceRequest, GeofenceType } from "@/lib/types";

const GeofenceMap = dynamic(
  () => import("@/components/geofencing/GeofenceMap").then((m) => m.GeofenceMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[400px] items-center justify-center rounded-lg border bg-muted/50">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export default function NewGeofencePage() {
  const router = useRouter();
  const createGeofence = useCreateGeofence();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<GeofenceType>("circle");
  const [centerLat, setCenterLat] = React.useState(37.7749);
  const [centerLng, setCenterLng] = React.useState(-122.4194);
  const [radius, setRadius] = React.useState(500);
  const [points, setPoints] = React.useState<GeofencePoint[]>([]);
  const [dwellMinutes, setDwellMinutes] = React.useState(0);

  function handleMapClick(lat: number, lng: number) {
    if (type === "circle") {
      setCenterLat(lat);
      setCenterLng(lng);
    } else {
      setPoints((prev) => [...prev, { lat, lng }]);
    }
  }

  async function handleSave() {
    let req: CreateGeofenceRequest;
    if (type === "circle") {
      req = {
        type: "circle",
        name,
        description: description || undefined,
        center_lat: centerLat,
        center_lng: centerLng,
        radius_meters: radius,
        dwell_time_seconds: dwellMinutes * 60,
      };
    } else {
      req = {
        type: "polygon",
        name,
        description: description || undefined,
        points,
        dwell_time_seconds: dwellMinutes * 60,
      };
    }
    await createGeofence.mutateAsync(req);
    router.push("/geofencing");
  }

  const canSave = name.trim().length > 0 && (type === "circle" || points.length >= 3);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/geofencing">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Geofence</h1>
          <p className="text-sm text-muted-foreground">
            {type === "circle"
              ? "Click on the map to set the center point"
              : "Click on the map to add polygon points"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Map */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <div className="h-[500px]">
                <GeofenceMap
                  geofences={[]}
                  center={[centerLat, centerLng]}
                  zoom={13}
                  editable
                  editType={type}
                  editCenter={type === "circle" ? [centerLat, centerLng] : undefined}
                  editRadius={type === "circle" ? radius : undefined}
                  editPoints={type === "polygon" ? points : undefined}
                  onMapClick={handleMapClick}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Properties Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Properties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  className="mt-1"
                  placeholder="Geofence name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Input
                  className="mt-1"
                  placeholder="Optional description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <div className="mt-1 flex gap-2">
                  <Button
                    size="sm"
                    variant={type === "circle" ? "default" : "outline"}
                    onClick={() => { setType("circle"); setPoints([]); }}
                  >
                    Circle
                  </Button>
                  <Button
                    size="sm"
                    variant={type === "polygon" ? "default" : "outline"}
                    onClick={() => setType("polygon")}
                  >
                    Polygon
                  </Button>
                </div>
              </div>

              {type === "circle" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Latitude</label>
                      <Input
                        className="mt-1"
                        type="number"
                        step="0.0001"
                        value={centerLat}
                        onChange={(e) => setCenterLat(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Longitude</label>
                      <Input
                        className="mt-1"
                        type="number"
                        step="0.0001"
                        value={centerLng}
                        onChange={(e) => setCenterLng(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Radius: {radius >= 1000 ? `${(radius / 1000).toFixed(1)}km` : `${radius}m`}
                    </label>
                    <input
                      type="range"
                      className="mt-1 w-full"
                      min={50}
                      max={50000}
                      step={50}
                      value={radius}
                      onChange={(e) => setRadius(parseInt(e.target.value))}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>50m</span>
                      <span>50km</span>
                    </div>
                  </div>
                </>
              )}

              {type === "polygon" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Points ({points.length})
                  </label>
                  {points.length < 3 && (
                    <p className="mt-1 text-xs text-amber-600">
                      Click on the map to add at least 3 points
                    </p>
                  )}
                  {points.length > 0 && (
                    <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                      {points.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span>{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1 text-xs"
                            onClick={() => setPoints(points.filter((_, j) => j !== i))}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {points.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 text-xs"
                      onClick={() => setPoints([])}
                    >
                      Clear All Points
                    </Button>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Dwell Time (minutes)
                </label>
                <Input
                  className="mt-1"
                  type="number"
                  min={0}
                  value={dwellMinutes}
                  onChange={(e) => setDwellMinutes(parseInt(e.target.value) || 0)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Time a device must remain inside before triggering dwell event. 0 = disabled.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={!canSave || createGeofence.isPending} className="flex-1">
              {createGeofence.isPending ? "Creating..." : "Create Geofence"}
            </Button>
            <Link href="/geofencing">
              <Button variant="outline">Cancel</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
