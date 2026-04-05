"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, MoreHorizontal, Lock, Trash2, MessageSquare, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DeviceStatusBadge } from "@/components/devices/DeviceStatusBadge";
import { ComplianceBadge } from "@/components/devices/ComplianceBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDevices } from "@/hooks/queries/use-devices";
import { useBulkAction } from "@/hooks/mutations/use-remote-action";
import { formatRelativeTime } from "@/lib/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { Device, ListDevicesParams } from "@/lib/types";

export default function DevicesPage() {
  const router = useRouter();
  const [filters, setFilters] = React.useState({
    search: "",
    debouncedSearch: "",
    page: 1,
    pageSize: 20,
    statusFilter: "",
    complianceFilter: "",
    sortBy: undefined as string | undefined,
    sortOrder: "asc" as "asc" | "desc",
  });
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const bulkAction = useBulkAction();

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => setFilters(prev => ({ ...prev, debouncedSearch: prev.search })), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Reset page on filter change
  React.useEffect(() => {
    setFilters(prev => ({ ...prev, page: 1 }));
  }, [filters.debouncedSearch, filters.statusFilter, filters.complianceFilter]);

  const params: ListDevicesParams = {
    page: filters.page,
    limit: filters.pageSize,
    search: filters.debouncedSearch || undefined,
    status: (filters.statusFilter as ListDevicesParams["status"]) || undefined,
    complianceStatus: (filters.complianceFilter as ListDevicesParams["complianceStatus"]) || undefined,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  };

  const { data, isLoading, isError } = useDevices(params);
  const devices = data?.data ?? [];
  const pagination = data?.pagination;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === devices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(devices.map((d) => d.id)));
    }
  };

  const handleSort = (key: string) => {
    setFilters(prev => {
      if (prev.sortBy === key) {
        return { ...prev, sortOrder: prev.sortOrder === "asc" ? "desc" as const : "asc" as const };
      }
      return { ...prev, sortBy: key, sortOrder: "asc" as const };
    });
  };

  const handleBulkAction = (type: string) => {
    if (selectedIds.size === 0) return;
    bulkAction.mutate(
      { type, deviceIds: Array.from(selectedIds) },
      { onSuccess: () => setSelectedIds(new Set()) },
    );
  };

  const SortHeader = ({ colKey, children }: { colKey: string; children: React.ReactNode }) => (
    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort(colKey)}>
      {children}
      {filters.sortBy === colKey ? (
        filters.sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
      ) : (
        <ChevronsUpDown className="h-4 w-4 opacity-50" />
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Devices"
        description="Manage enrolled devices across your fleet"
        actions={
          <Button onClick={() => router.push("/enrollment")}>
            <Plus className="mr-2 h-4 w-4" />
            Enroll Device
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search devices..."
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            className="pl-9"
          />
        </div>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={filters.statusFilter}
          onChange={(e) => setFilters(prev => ({ ...prev, statusFilter: e.target.value }))}
        >
          <option value="">All Status</option>
          <option value="enrolled">Enrolled</option>
          <option value="pending">Pending</option>
          <option value="blocked">Blocked</option>
          <option value="wiped">Wiped</option>
          <option value="retired">Retired</option>
        </select>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={filters.complianceFilter}
          onChange={(e) => setFilters(prev => ({ ...prev, complianceFilter: e.target.value }))}
        >
          <option value="">All Compliance</option>
          <option value="compliant">Compliant</option>
          <option value="non_compliant">Non-Compliant</option>
          <option value="unknown">Unknown</option>
        </select>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={filters.pageSize}
          onChange={(e) => setFilters(prev => ({ ...prev, pageSize: Number(e.target.value), page: 1 }))}
        >
          <option value={10}>10 per page</option>
          <option value={20}>20 per page</option>
          <option value={50}>50 per page</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md bg-muted p-3">
          <span className="text-sm font-medium">{selectedIds.size} device(s) selected</span>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("lock")}>
            <Lock className="mr-1 h-3 w-3" /> Lock All
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleBulkAction("wipe")}>
            <Trash2 className="mr-1 h-3 w-3" /> Wipe All
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("send_message")}>
            <MessageSquare className="mr-1 h-3 w-3" /> Send Message
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={devices.length > 0 && selectedIds.size === devices.length}
                  onChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead><SortHeader colKey="name">Device Name</SortHeader></TableHead>
              <TableHead><SortHeader colKey="model">Model</SortHeader></TableHead>
              <TableHead><SortHeader colKey="osVersion">OS Version</SortHeader></TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Compliance</TableHead>
              <TableHead><SortHeader colKey="lastSeenAt">Last Seen</SortHeader></TableHead>
              <TableHead className="w-12">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  Failed to load devices. Please try again.
                </TableCell>
              </TableRow>
            ) : devices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No devices found.
                </TableCell>
              </TableRow>
            ) : (
              devices.map((device) => (
                <TableRow
                  key={device.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/devices/${device.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={selectedIds.has(device.id)}
                      onChange={() => toggleSelect(device.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {device.name ?? device.serialNumber ?? device.udid}
                  </TableCell>
                  <TableCell>{device.model ?? "-"}</TableCell>
                  <TableCell>{device.osVersion ?? "-"}</TableCell>
                  <TableCell><DeviceStatusBadge status={device.status} /></TableCell>
                  <TableCell><ComplianceBadge status={device.complianceStatus} /></TableCell>
                  <TableCell>{device.lastSeenAt ? formatRelativeTime(device.lastSeenAt) : "Never"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => router.push(`/devices/${device.id}`)}>
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleBulkAction("lock")}>
                          Lock Device
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleBulkAction("reboot")}>
                          Reboot Device
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= pagination.totalPages}
              onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
