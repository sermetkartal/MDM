"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAssignPolicy } from "@/hooks/mutations/use-policy";
import { api } from "@/lib/api-client";
import type { PaginatedResponse, Device, DeviceGroup } from "@/lib/types";

interface PolicyAssignmentModalProps {
  policyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PolicyAssignmentModal({ policyId, open, onOpenChange }: PolicyAssignmentModalProps) {
  const [deviceSearch, setDeviceSearch] = React.useState("");
  const [groupSearch, setGroupSearch] = React.useState("");
  const [selectedDevices, setSelectedDevices] = React.useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = React.useState<Set<string>>(new Set());

  const assignPolicy = useAssignPolicy(policyId);

  const { data: devicesData } = useQuery({
    queryKey: ["devices", "assignment-list", deviceSearch],
    queryFn: () =>
      api.get<PaginatedResponse<Device>>(
        `/v1/devices?limit=50${deviceSearch ? `&search=${encodeURIComponent(deviceSearch)}` : ""}`,
      ),
    enabled: open,
  });

  const { data: groupsData } = useQuery({
    queryKey: ["groups", "assignment-list", groupSearch],
    queryFn: () =>
      api.get<PaginatedResponse<DeviceGroup>>(
        `/v1/groups?limit=50`,
      ),
    enabled: open,
  });

  const devices = devicesData?.data ?? [];
  const groups = (groupsData?.data ?? []).filter(
    (g) => !groupSearch || g.name.toLowerCase().includes(groupSearch.toLowerCase()),
  );

  const toggleDevice = (id: string) => {
    setSelectedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (id: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    const promises: Promise<unknown>[] = [];
    for (const deviceId of selectedDevices) {
      promises.push(assignPolicy.mutateAsync({ deviceId }));
    }
    for (const groupId of selectedGroups) {
      promises.push(assignPolicy.mutateAsync({ groupId }));
    }
    await Promise.all(promises);
    setSelectedDevices(new Set());
    setSelectedGroups(new Set());
    onOpenChange(false);
  };

  const totalSelected = selectedDevices.size + selectedGroups.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign Policy</DialogTitle>
          <DialogDescription>Select devices or groups to assign this policy to.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="devices">
          <TabsList>
            <TabsTrigger value="devices">Devices ({selectedDevices.size})</TabsTrigger>
            <TabsTrigger value="groups">Groups ({selectedGroups.size})</TabsTrigger>
          </TabsList>

          <TabsContent value="devices">
            <div className="space-y-3">
              <Input
                placeholder="Search devices..."
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
              />
              <div className="max-h-64 overflow-y-auto rounded-md border">
                {devices.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">No devices found.</p>
                ) : (
                  devices.map((device) => (
                    <label
                      key={device.id}
                      className="flex cursor-pointer items-center gap-3 border-b px-4 py-2 last:border-0 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={selectedDevices.has(device.id)}
                        onChange={() => toggleDevice(device.id)}
                      />
                      <div>
                        <p className="text-sm font-medium">{device.name ?? device.udid}</p>
                        <p className="text-xs text-muted-foreground">{device.model} - {device.platform}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="groups">
            <div className="space-y-3">
              <Input
                placeholder="Search groups..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
              />
              <div className="max-h-64 overflow-y-auto rounded-md border">
                {groups.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">No groups found.</p>
                ) : (
                  groups.map((group) => (
                    <label
                      key={group.id}
                      className="flex cursor-pointer items-center gap-3 border-b px-4 py-2 last:border-0 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={selectedGroups.has(group.id)}
                        onChange={() => toggleGroup(group.id)}
                      />
                      <div>
                        <p className="text-sm font-medium">{group.name}</p>
                        <p className="text-xs text-muted-foreground">{group.description ?? "No description"}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={totalSelected === 0 || assignPolicy.isPending}>
            {assignPolicy.isPending ? "Assigning..." : `Assign to ${totalSelected} target(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
