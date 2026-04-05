"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Battery,
  HardDrive,
  Cpu,
  MapPin,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
type TimeRange = "24h" | "7d" | "30d";

const demoTelemetryData = Array.from({length: 24}, (_, i) => ({
  time: new Date(Date.now() - (23-i) * 3600000).toISOString(),
  battery: Math.round(100 - i * 1.5 + Math.random() * 5),
  storage: Math.round(2000 + Math.random() * 500),
  memory: Math.round(1000 + Math.random() * 500),
  storage_used_percent: Math.round(35 + Math.random() * 5),
  memory_used_percent: Math.round(45 + Math.random() * 15),
}));

const demoLocationHistory = [
  { lat: 41.0082, lng: 28.9784, timestamp: new Date(Date.now() - 3600000).toISOString(), accuracy: 10 },
  { lat: 41.0090, lng: 28.9790, timestamp: new Date(Date.now() - 7200000).toISOString(), accuracy: 15 },
  { lat: 41.0075, lng: 28.9770, timestamp: new Date(Date.now() - 10800000).toISOString(), accuracy: 8 },
];

export default function DeviceTelemetryPage() {
  const params = useParams();
  const deviceId = params.deviceId as string;
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");

  const telemetryLoading = false;
  const locationLoading = false;
  const chartData = demoTelemetryData;
  const locations = demoLocationHistory;

  const formatTime = (time: string) => {
    const d = new Date(time);
    if (timeRange === "24h") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (timeRange === "7d") return d.toLocaleDateString([], { weekday: "short", hour: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/devices/${deviceId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title="Device Telemetry"
          description={`Monitoring data for device ${deviceId}`}
        />
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-2">
        {(["24h", "7d", "30d"] as TimeRange[]).map((range) => (
          <Button
            key={range}
            variant={timeRange === range ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeRange(range)}
          >
            {range}
          </Button>
        ))}
      </div>

      <Tabs defaultValue="battery">
        <TabsList>
          <TabsTrigger value="battery">
            <Battery className="mr-1 h-4 w-4" /> Battery
          </TabsTrigger>
          <TabsTrigger value="storage">
            <HardDrive className="mr-1 h-4 w-4" /> Storage
          </TabsTrigger>
          <TabsTrigger value="memory">
            <Cpu className="mr-1 h-4 w-4" /> Memory
          </TabsTrigger>
          <TabsTrigger value="location">
            <MapPin className="mr-1 h-4 w-4" /> Location
          </TabsTrigger>
        </TabsList>

        {/* Battery Chart */}
        <TabsContent value="battery">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Battery Level</CardTitle>
            </CardHeader>
            <CardContent>
              {telemetryLoading ? (
                <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                  Loading telemetry data...
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                  No battery data available for this time range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tickFormatter={formatTime} fontSize={12} />
                    <YAxis domain={[0, 100]} unit="%" fontSize={12} />
                    <Tooltip
                      labelFormatter={(label) => new Date(label).toLocaleString()}
                      formatter={(value: number) => [`${Math.round(value)}%`, "Battery"]}
                    />
                    {/* Red zone: 0-20% */}
                    <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="3 3" label="Critical" />
                    {/* Yellow zone: 20-50% */}
                    <ReferenceLine y={50} stroke="#eab308" strokeDasharray="3 3" label="Low" />
                    <Line
                      type="monotone"
                      dataKey="battery"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Storage Chart */}
        <TabsContent value="storage">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Storage Usage (Free MB)</CardTitle>
            </CardHeader>
            <CardContent>
              {telemetryLoading ? (
                <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                  Loading telemetry data...
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                  No storage data available for this time range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tickFormatter={formatTime} fontSize={12} />
                    <YAxis unit=" MB" fontSize={12} />
                    <Tooltip
                      labelFormatter={(label) => new Date(label).toLocaleString()}
                      formatter={(value: number) => [`${Math.round(value)} MB`, "Free Storage"]}
                    />
                    <ReferenceLine y={500} stroke="#ef4444" strokeDasharray="3 3" label="Low" />
                    <Area
                      type="monotone"
                      dataKey="storage"
                      stroke="#3b82f6"
                      fill="#3b82f680"
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Memory Chart */}
        <TabsContent value="memory">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Memory Usage (Free MB)</CardTitle>
            </CardHeader>
            <CardContent>
              {telemetryLoading ? (
                <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                  Loading telemetry data...
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                  No memory data available for this time range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tickFormatter={formatTime} fontSize={12} />
                    <YAxis unit=" MB" fontSize={12} />
                    <Tooltip
                      labelFormatter={(label) => new Date(label).toLocaleString()}
                      formatter={(value: number) => [`${Math.round(value)} MB`, "Free Memory"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="memory"
                      stroke="#a855f7"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Location History */}
        <TabsContent value="location">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Location History</CardTitle>
            </CardHeader>
            <CardContent>
              {locationLoading ? (
                <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                  Loading location data...
                </div>
              ) : locations.length === 0 ? (
                <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                  No location data available for this time range.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Map placeholder - full Mapbox integration in Phase 3 */}
                  <div className="flex h-[300px] items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50">
                    <div className="text-center">
                      <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Map view available in Phase 3 (Mapbox integration)
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {locations.length} location points recorded
                      </p>
                    </div>
                  </div>

                  {/* Coordinate list */}
                  <div className="max-h-[300px] overflow-y-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background border-b">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Time</th>
                          <th className="px-4 py-2 text-left font-medium">Latitude</th>
                          <th className="px-4 py-2 text-left font-medium">Longitude</th>
                          <th className="px-4 py-2 text-left font-medium">Accuracy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {locations.map((point, idx) => (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="px-4 py-2 text-muted-foreground">
                              {new Date(point.timestamp).toLocaleString()}
                            </td>
                            <td className="px-4 py-2 font-mono">{point.lat.toFixed(6)}</td>
                            <td className="px-4 py-2 font-mono">{point.lng.toFixed(6)}</td>
                            <td className="px-4 py-2">
                              {point.accuracy ? `${Math.round(point.accuracy)}m` : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
