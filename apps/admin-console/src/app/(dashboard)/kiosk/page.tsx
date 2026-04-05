"use client";

import { Plus, Monitor } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface KioskRow {
  id: string;
  name: string;
  app: string;
  devices: number;
  status: string;
  [key: string]: unknown;
}

const mockProfiles: KioskRow[] = [
  { id: "k1", name: "Retail POS Kiosk", app: "POS Terminal v3.2", devices: 45, status: "Active" },
  { id: "k2", name: "Visitor Check-in", app: "Check-In App v1.5", devices: 12, status: "Active" },
  { id: "k3", name: "Digital Signage", app: "Signage Player v2.0", devices: 30, status: "Active" },
  { id: "k4", name: "Warehouse Scanner", app: "Inventory Scanner v4.1", devices: 25, status: "Draft" },
];

const columns: Column<KioskRow>[] = [
  {
    key: "name",
    header: "Profile Name",
    sortable: true,
    render: (row) => (
      <div className="flex items-center gap-2">
        <Monitor className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{row.name}</span>
      </div>
    ),
  },
  { key: "app", header: "Pinned App" },
  { key: "devices", header: "Devices", sortable: true },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge variant={row.status === "Active" ? "success" : "secondary"}>
        {row.status}
      </Badge>
    ),
  },
];

export default function KioskPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Kiosk Profiles"
        description="Manage single-app and multi-app kiosk configurations"
        actions={
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Profile
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={mockProfiles}
        searchKey="name"
        searchPlaceholder="Search profiles..."
      />
    </div>
  );
}
