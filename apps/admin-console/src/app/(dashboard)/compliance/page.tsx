"use client";

import { CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ComplianceBadge } from "@/components/devices/ComplianceBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ComplianceRow {
  id: string;
  device: string;
  rule: string;
  status: "compliant" | "non_compliant" | "pending";
  lastChecked: string;
  [key: string]: unknown;
}

const mockViolations: ComplianceRow[] = [
  { id: "v1", device: "Galaxy S24 - Field #3", rule: "Screen lock required", status: "non_compliant", lastChecked: "5 min ago" },
  { id: "v2", device: "Pixel 7a - Reception", rule: "Encryption enabled", status: "non_compliant", lastChecked: "1 hour ago" },
  { id: "v3", device: "iPhone 15 - Sales", rule: "OS version >= 16", status: "non_compliant", lastChecked: "30 min ago" },
  { id: "v4", device: "Galaxy Tab S9", rule: "No rooted devices", status: "non_compliant", lastChecked: "2 hours ago" },
  { id: "v5", device: "Pixel 6 - Delivery", rule: "VPN always on", status: "pending", lastChecked: "15 min ago" },
];

const columns: Column<ComplianceRow>[] = [
  { key: "device", header: "Device", sortable: true },
  { key: "rule", header: "Violated Rule" },
  {
    key: "status",
    header: "Status",
    render: (row) => <ComplianceBadge status={row.status} />,
  },
  { key: "lastChecked", header: "Last Checked", sortable: true },
];

export default function CompliancePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance"
        description="Monitor device compliance across your organization"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Compliant" value="1,237" icon={CheckCircle} />
        <StatCard title="Non-Compliant" value="35" icon={XCircle} />
        <StatCard title="Pending" value="12" icon={Clock} />
        <StatCard title="Critical" value="5" icon={AlertTriangle} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Violations</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={mockViolations}
            searchKey="device"
            searchPlaceholder="Search devices..."
          />
        </CardContent>
      </Card>
    </div>
  );
}
