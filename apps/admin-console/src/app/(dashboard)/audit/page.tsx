"use client";

import { useState, useRef } from "react";
import { Download, Search, ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditLog, ListAuditLogsParams } from "@/lib/types";

const actorTypeColors: Record<string, "default" | "secondary" | "destructive"> = {
  user: "default",
  device: "secondary",
  system: "secondary",
};

const actionBadgeVariant = (action: string): "default" | "destructive" | "warning" | "secondary" => {
  if (action.includes("delete") || action.includes("wipe") || action.includes("revoke")) return "destructive";
  if (action.includes("update") || action.includes("modify")) return "warning";
  if (action.includes("create") || action.includes("enroll") || action.includes("issue")) return "default";
  return "secondary";
};

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function DetailView({ details }: { details: Record<string, unknown> }) {
  if (!details || Object.keys(details).length === 0) {
    return <p className="text-sm text-muted-foreground">No additional details</p>;
  }

  const before = details.before as Record<string, unknown> | undefined;
  const after = details.after as Record<string, unknown> | undefined;

  if (before && after) {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Before</h4>
          <pre className="max-h-48 overflow-auto rounded bg-red-50 p-2 text-xs dark:bg-red-950">
            {JSON.stringify(before, null, 2)}
          </pre>
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">After</h4>
          <pre className="max-h-48 overflow-auto rounded bg-green-50 p-2 text-xs dark:bg-green-950">
            {JSON.stringify(after, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
      {JSON.stringify(details, null, 2)}
    </pre>
  );
}

export default function AuditPage() {
  const [filters, setFilters] = useState<ListAuditLogsParams>({
    page_size: 50,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");

  const isLoading = false;
  const isFetchingNextPage = false;
  const hasNextPage = false;

  const allAuditLogs: AuditLog[] = [
    { id: "al1", orgId: "org1", userId: "u1", actor: "admin@mdm.local", actorType: "user", actorDisplay: "admin@mdm.local", action: "device.enrolled", resource: "WH-001", resourceId: "WH-001", resourceType: "device", details: { method: "qr_code" }, ipAddress: "192.168.1.100", createdAt: new Date(Date.now() - 60000).toISOString() },
    { id: "al2", orgId: "org1", userId: "u1", actor: "admin@mdm.local", actorType: "user", actorDisplay: "admin@mdm.local", action: "policy.created", resource: "WiFi Restriction", resourceId: "p1", resourceType: "policy", details: { name: "WiFi Restriction" }, ipAddress: "192.168.1.100", createdAt: new Date(Date.now() - 3600000).toISOString() },
    { id: "al3", orgId: "org1", userId: null, actor: "compliance-engine", actorType: "system", actorDisplay: "compliance-engine", action: "compliance.violated", resource: "KSK-012", resourceId: "KSK-012", resourceType: "device", details: { rule: "OS Version >= 13", severity: "high" }, ipAddress: null, createdAt: new Date(Date.now() - 7200000).toISOString() },
    { id: "al4", orgId: "org1", userId: "u1", actor: "admin@mdm.local", actorType: "user", actorDisplay: "admin@mdm.local", action: "command.dispatched", resource: "RT-POS-01", resourceId: "RT-POS-01", resourceType: "device", details: { type: "lock" }, ipAddress: "192.168.1.100", createdAt: new Date(Date.now() - 14400000).toISOString() },
    { id: "al5", orgId: "org1", userId: null, actor: "WH-002", actorType: "device", actorDisplay: "WH-002", action: "device.heartbeat", resource: "WH-002", resourceId: "WH-002", resourceType: "device", details: { battery: 85 }, ipAddress: "10.0.1.15", createdAt: new Date(Date.now() - 30000).toISOString() },
    { id: "al6", orgId: "org1", userId: "u1", actor: "admin@mdm.local", actorType: "user", actorDisplay: "admin@mdm.local", action: "app.installed", resource: "POS Terminal", resourceId: "POS Terminal", resourceType: "app", details: { version: "3.2.1", device: "RT-POS-01" }, ipAddress: "192.168.1.100", createdAt: new Date(Date.now() - 86400000).toISOString() },
    { id: "al7", orgId: "org1", userId: null, actor: "cert-service", actorType: "system", actorDisplay: "cert-service", action: "certificate.expiring", resource: "c4", resourceId: "c4", resourceType: "certificate", details: { days_remaining: 7 }, ipAddress: null, createdAt: new Date(Date.now() - 172800000).toISOString() },
    { id: "al8", orgId: "org1", userId: "u1", actor: "admin@mdm.local", actorType: "user", actorDisplay: "admin@mdm.local", action: "kiosk.activated", resource: "RT-POS-08", resourceId: "RT-POS-08", resourceType: "device", details: { mode: "single_app", app: "POS Terminal" }, ipAddress: "192.168.1.100", createdAt: new Date(Date.now() - 259200000).toISOString() },
  ];

  // Apply filters to dummy data
  const allLogs = allAuditLogs.filter((log) => {
    if (filters.actor_type && log.actorType !== filters.actor_type) return false;
    if (filters.resource_type && log.resourceType !== filters.resource_type) return false;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      if (!log.action.toLowerCase().includes(s) && !log.resource.toLowerCase().includes(s) && !log.actorDisplay.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleSearch = () => {
    setFilters((f) => ({ ...f, search: searchInput || undefined }));
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filters.actor_type) params.set("actor_type", filters.actor_type);
    if (filters.action) params.set("action", filters.action);
    if (filters.resource_type) params.set("resource_type", filters.resource_type);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.search) params.set("search", filters.search);
    const url = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api"}/v1/audit/export?${params.toString()}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="View all administrative actions and system events"
        actions={
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search actions, resources..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-64"
          />
          <Button size="sm" variant="secondary" onClick={handleSearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={filters.actor_type ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, actor_type: e.target.value || undefined }))
          }
        >
          <option value="">All Actor Types</option>
          <option value="user">User</option>
          <option value="device">Device</option>
          <option value="system">System</option>
        </select>

        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={filters.resource_type ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, resource_type: e.target.value || undefined }))
          }
        >
          <option value="">All Resources</option>
          <option value="device">Device</option>
          <option value="policy">Policy</option>
          <option value="certificate">Certificate</option>
          <option value="user">User</option>
          <option value="group">Group</option>
          <option value="compliance">Compliance</option>
        </select>

        <Input
          type="date"
          className="w-40"
          value={filters.from?.split("T")[0] ?? ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              from: e.target.value ? e.target.value + "T00:00:00Z" : undefined,
            }))
          }
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          className="w-40"
          value={filters.to?.split("T")[0] ?? ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              to: e.target.value ? e.target.value + "T23:59:59Z" : undefined,
            }))
          }
        />
      </div>

      {/* Audit Log Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Timestamp</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>IP Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Loading audit logs...
                </TableCell>
              </TableRow>
            ) : allLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No audit log entries found.
                </TableCell>
              </TableRow>
            ) : (
              allLogs.map((log) => (
                <>
                  <TableRow
                    key={log.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      setExpandedId(expandedId === log.id ? null : log.id)
                    }
                  >
                    <TableCell className="w-8">
                      {expandedId === log.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatTimestamp(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={actorTypeColors[log.actorType ?? "system"] ?? "secondary"}
                          className="text-xs"
                        >
                          {log.actorType}
                        </Badge>
                        <span className="text-sm">{log.actorDisplay}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={actionBadgeVariant(log.action)}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.resource}
                      {log.resourceType && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({log.resourceType})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.ipAddress ?? "-"}
                    </TableCell>
                  </TableRow>
                  {expandedId === log.id && (
                    <TableRow key={`${log.id}-detail`}>
                      <TableCell colSpan={6} className="bg-muted/30 p-4">
                        <DetailView details={log.details} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="h-4">
        {isFetchingNextPage && (
          <p className="text-center text-sm text-muted-foreground">
            Loading more...
          </p>
        )}
      </div>
    </div>
  );
}
