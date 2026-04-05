"use client";

import { Smartphone, Wifi, ShieldAlert, AlertTriangle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { StatCard } from "@/components/common/StatCard";
import { PageHeader } from "@/components/common/PageHeader";
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

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Fleet Overview"
        description="Monitor and manage your device fleet"
      />

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Devices"
          value="1,284"
          icon={Smartphone}
          trend={{ value: 12.5, label: "from last month" }}
        />
        <StatCard
          title="Online"
          value="1,062"
          icon={Wifi}
          trend={{ value: 3.2, label: "from last hour" }}
        />
        <StatCard
          title="Non-Compliant"
          value="47"
          icon={ShieldAlert}
          trend={{ value: -8.1, label: "from last week" }}
        />
        <StatCard
          title="Critical Alerts"
          value="12"
          icon={AlertTriangle}
          trend={{ value: -15.3, label: "from yesterday" }}
        />
      </div>

      {/* Charts */}
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
    </div>
  );
}
