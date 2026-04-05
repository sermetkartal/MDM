"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Device, ListDevicesParams, PaginatedResponse, DataResponse, DevicePolicy, DeviceApp, DeviceViolation } from "@/lib/types";

export const deviceKeys = {
  all: ["devices"] as const,
  lists: () => [...deviceKeys.all, "list"] as const,
  list: (params: ListDevicesParams) => [...deviceKeys.lists(), params] as const,
  details: () => [...deviceKeys.all, "detail"] as const,
  detail: (id: string) => [...deviceKeys.details(), id] as const,
  policies: (id: string) => [...deviceKeys.detail(id), "policies"] as const,
  apps: (id: string) => [...deviceKeys.detail(id), "apps"] as const,
  compliance: (id: string) => [...deviceKeys.detail(id), "compliance"] as const,
};

export function useDevices(params: ListDevicesParams = {}) {
  return useQuery({
    queryKey: deviceKeys.list(params),
    queryFn: () =>
      api.get<PaginatedResponse<Device>>(
        `/v1/devices?${new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== "")
            .map(([k, v]) => [k, String(v)]),
        ).toString()}`,
      ),
  });
}

export function useDevice(deviceId: string) {
  return useQuery({
    queryKey: deviceKeys.detail(deviceId),
    queryFn: () => api.get<Device>(`/v1/devices/${deviceId}`),
    enabled: !!deviceId,
  });
}

export function useDevicePolicies(deviceId: string) {
  return useQuery({
    queryKey: deviceKeys.policies(deviceId),
    queryFn: () => api.get<DataResponse<DevicePolicy>>(`/v1/devices/${deviceId}/policies`),
    enabled: !!deviceId,
  });
}

export function useDeviceApps(deviceId: string) {
  return useQuery({
    queryKey: deviceKeys.apps(deviceId),
    queryFn: () => api.get<DataResponse<DeviceApp>>(`/v1/devices/${deviceId}/apps`),
    enabled: !!deviceId,
  });
}

export function useDeviceCompliance(deviceId: string) {
  return useQuery({
    queryKey: deviceKeys.compliance(deviceId),
    queryFn: () => api.get<DataResponse<DeviceViolation>>(`/v1/devices/${deviceId}/compliance`),
    enabled: !!deviceId,
  });
}

export function useInvalidateDevices() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: deviceKeys.all });
}
