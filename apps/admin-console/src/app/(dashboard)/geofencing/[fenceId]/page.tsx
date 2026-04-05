"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { GeofenceActionConfig } from "@/components/geofencing/GeofenceActionConfig";
import { useGeofence, useGeofencePolicies, useGeofenceEvents, useGeofenceDevices } from "@/hooks/queries/use-geofences";
import { useUpdateGeofence, useDeleteGeofence, useAddGeofencePolicy, useDeleteGeofencePolicy } from "@/hooks/mutations/use-geofence";
import { formatDate } from "@/lib/utils";
import type { GeofencePoint, GeofenceType } from "@/lib/types";

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

export default function GeofenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const fenceId = params.fenceId as string;

  const { data: fence, isLoading } = useGeofence(fenceId);
  const { data: policiesData } = useGeofencePolicies(fenceId);
  const { data: eventsData } = useGeofenceEvents(fenceId);
  const { data: devicesData } = useGeofenceDevices(fenceId);
  const updateGeofence = useUpdateGeofence(fenceId);
  const deleteGeofence = useDeleteGeofence();
  const addPolicy = useAddGeofencePolicy(fenceId);
  const deletePolicy = useDeleteGeofencePolicy(fenceId);

  const policies = policiesData?.data ?? [];
  const events = eventsData?.data ?? [];
  const insideDevices = devicesData?.data ?? [];

  // Edit state
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<GeofenceType>("circle");
  const [centerLat, setCenterLat] = React.useState(0);
  const [centerLng, setCenterLng] = React.useState(0);
  const [radius, setRadius] = React.useState(500);
  const [points, setPoints] = React.useState<GeofencePoint[]>([]);
  const [dwellMinutes, setDwellMinutes] = React.useState(0);
  const [isActive, setIsActive] = React.useState(true);
  const [initialized, setInitialized] = React.useState(false);

  React.useEffect(() => {
    if (fence && !initialized) {
      setName(fence.name);
      setDescription(fence.description ?? "");
      setType(fence.type);
      setCenterLat(parseFloat(fence.centerLat));
      setCenterLng(parseFloat(fence.centerLng));
      setRadius(fence.radiusMeters);
      setPoints(fence.polygon ?? []);
      setDwellMinutes(Math.round(fence.dwellTimeSeconds / 60));
      setIsActive(fence.isActive);
      setInitialized(true);
    }
  }, [fence, initialized]);

  function handleMapClick(lat: number, lng: number) {
    if (type === "circle") {
      setCenterLat(lat);
      setCenterLng(lng);
    } else {
      setPoints((prev) => [...prev, { lat, lng }]);
    }
  }

  async function handleSave() {
    await updateGeofence.mutateAsync({
      name,
      description: description || undefined,
      type,
      center_lat: type === "circle" ? centerLat : undefined,
      center_lng: type === "circle" ? centerLng : undefined,
      radius_meters: type === "circle" ? radius : undefined,
      points: type === "polygon" ? points : undefined,
      dwell_time_seconds: dwellMinutes * 60,
      is_active: isActive,
    });
  }

  async function handleDelete() {
    await deleteGeofence.mutateAsync(fenceId);
    router.push("/geofencing");
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!fence) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Geofence not found.
      </div>
    );
  }

  const mapCenter: [number, number] = [
    parseFloat(fence.centerLat) || 37.7749,
    parseFloat(fence.centerLng) || -122.4194,
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/geofencing">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{fence.name}</h1>
              <Badge variant={fence.isActive ? "default" : "secondary"}>
                {fence.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground capitalize">
              {fence.type} geofence
              {fence.type === "circle" && ` - ${fence.radiusMeters}m radius`}
            </p>
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteGeofence.isPending}>
          <Trash2 className="mr-1 h-4 w-4" />
          {deleteGeofence.isPending ? "Deleting..." : "Delete"}
        </Button>
      </div>

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="actions">Actions ({policies.length})</TabsTrigger>
          <TabsTrigger value="events">Events ({events.length})</TabsTrigger>
          <TabsTrigger value="devices">Devices Inside ({insideDevices.length})</TabsTrigger>
        </TabsList>

        {/* Edit Tab */}
        <TabsContent value="edit">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Map */}
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="p-0">
                  <div className="h-[500px]">
                    <GeofenceMap
                      geofences={[fence]}
                      center={mapCenter}
                      zoom={14}
                      selectedFenceId={fenceId}
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

            {/* Properties */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Properties</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Description</label>
                    <Input className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Type</label>
                    <div className="mt-1 flex gap-2">
                      <Button size="sm" variant={type === "circle" ? "default" : "outline"} onClick={() => { setType("circle"); setPoints([]); }}>
                        Circle
                      </Button>
                      <Button size="sm" variant={type === "polygon" ? "default" : "outline"} onClick={() => setType("polygon")}>
                        Polygon
                      </Button>
                    </div>
                  </div>

                  {type === "circle" && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Latitude</label>
                          <Input className="mt-1" type="number" step="0.0001" value={centerLat} onChange={(e) => setCenterLat(parseFloat(e.target.value) || 0)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Longitude</label>
                          <Input className="mt-1" type="number" step="0.0001" value={centerLng} onChange={(e) => setCenterLng(parseFloat(e.target.value) || 0)} />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          Radius: {radius >= 1000 ? `${(radius / 1000).toFixed(1)}km` : `${radius}m`}
                        </label>
                        <input type="range" className="mt-1 w-full" min={50} max={50000} step={50} value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>50m</span>
                          <span>50km</span>
                        </div>
                      </div>
                    </>
                  )}

                  {type === "polygon" && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Points ({points.length})</label>
                      {points.length < 3 && (
                        <p className="mt-1 text-xs text-amber-600">Need at least 3 points</p>
                      )}
                      {points.length > 0 && (
                        <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                          {points.map((p, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span>{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>
                              <Button variant="ghost" size="sm" className="h-5 px-1 text-xs" onClick={() => setPoints(points.filter((_, j) => j !== i))}>
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Dwell Time (minutes)</label>
                    <Input className="mt-1" type="number" min={0} value={dwellMinutes} onChange={(e) => setDwellMinutes(parseInt(e.target.value) || 0)} />
                  </div>

                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="isActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
                    <label htmlFor="isActive" className="text-sm">Active</label>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={updateGeofence.isPending} className="flex-1">
                  {updateGeofence.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Actions Tab */}
        <TabsContent value="actions">
          <GeofenceActionConfig
            policies={policies}
            onAdd={(req) => addPolicy.mutate(req)}
            onDelete={(id) => deletePolicy.mutate(id)}
            isAdding={addPolicy.isPending}
          />
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Events</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Device ID</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              event.triggerType === "enter"
                                ? "bg-green-100 text-green-800"
                                : event.triggerType === "exit"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800"
                            }
                          >
                            {event.triggerType}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {event.deviceId.slice(0, 8)}...
                        </TableCell>
                        <TableCell className="text-xs">
                          {parseFloat(event.latitude).toFixed(4)}, {parseFloat(event.longitude).toFixed(4)}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(event.occurredAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Devices Inside Tab */}
        <TabsContent value="devices">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Devices Currently Inside</CardTitle>
            </CardHeader>
            <CardContent>
              {insideDevices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No devices currently inside this geofence.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {insideDevices.map((device) => (
                      <TableRow key={device.deviceId}>
                        <TableCell className="font-mono text-xs">
                          <Link href={`/devices/${device.deviceId}`} className="text-primary hover:underline">
                            {device.deviceId.slice(0, 8)}...
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{device.trigger}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(device.lastSeen)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
