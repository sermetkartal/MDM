"use client";

import dynamic from "next/dynamic";
import { Smartphone, Wifi, ShieldAlert, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/common/StatCard";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DashboardCharts = dynamic(() => import("@/components/dashboard/DashboardCharts"), {
  ssr: false,
  loading: () => (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Device Enrollments (Last 7 Days)</CardTitle></CardHeader>
        <CardContent><div className="h-[300px] animate-pulse rounded bg-muted" /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">OS Distribution</CardTitle></CardHeader>
        <CardContent><div className="h-[300px] animate-pulse rounded bg-muted" /></CardContent>
      </Card>
    </div>
  ),
});

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
      <DashboardCharts />
    </div>
  );
}
