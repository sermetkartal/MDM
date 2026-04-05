"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const enrollmentData = [
  { date: "Mon", devices: 12 },
  { date: "Tue", devices: 19 },
  { date: "Wed", devices: 15 },
  { date: "Thu", devices: 27 },
  { date: "Fri", devices: 23 },
  { date: "Sat", devices: 8 },
  { date: "Sun", devices: 5 },
];

const osDistribution = [
  { name: "Android 14", value: 340, color: "#3b82f6" },
  { name: "Android 13", value: 210, color: "#60a5fa" },
  { name: "Android 12", value: 85, color: "#93c5fd" },
  { name: "iOS 17", value: 150, color: "#10b981" },
  { name: "iOS 16", value: 65, color: "#34d399" },
];

export default function DashboardCharts() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Device Enrollments (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={enrollmentData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="devices"
                stroke="hsl(221.2, 83.2%, 53.3%)"
                fill="hsl(221.2, 83.2%, 53.3%)"
                fillOpacity={0.1}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">OS Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={osDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
              >
                {osDistribution.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap justify-center gap-4">
            {osDistribution.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-sm">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground">
                  {item.name} ({item.value})
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
