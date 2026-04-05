"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  Geofence,
  GeofencePolicy,
  GeofenceEvent,
  GeofenceDeviceInside,
  PaginatedResponse,
  DataResponse,
  PaginationParams,
} from "@/lib/types";

export const geofenceKeys = {
  all: ["geofences"] as const,
  lists: () => [...geofenceKeys.all, "list"] as const,
  list: (params: PaginationParams) => [...geofenceKeys.lists(), params] as const,
  details: () => [...geofenceKeys.all, "detail"] as const,
  detail: (id: string) => [...geofenceKeys.details(), id] as const,
  policies: (id: string) => [...geofenceKeys.detail(id), "policies"] as const,
  events: (id: string) => [...geofenceKeys.detail(id), "events"] as const,
  devices: (id: string) => [...geofenceKeys.detail(id), "devices"] as const,
};

export function useGeofences(params: PaginationParams = {}) {
  return useQuery({
    queryKey: geofenceKeys.list(params),
    queryFn: () =>
      api.get<PaginatedResponse<Geofence>>(
        `/v1/geofences?${new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== "")
            .map(([k, v]) => [k, String(v)]),
        ).toString()}`,
      ),
  });
}

export function useGeofence(fenceId: string) {
  return useQuery({
    queryKey: geofenceKeys.detail(fenceId),
    queryFn: () => api.get<Geofence>(`/v1/geofences/${fenceId}`),
    enabled: !!fenceId,
  });
}

export function useGeofencePolicies(fenceId: string) {
  return useQuery({
    queryKey: geofenceKeys.policies(fenceId),
    queryFn: () => api.get<DataResponse<GeofencePolicy>>(`/v1/geofences/${fenceId}/policies`),
    enabled: !!fenceId,
  });
}

export function useGeofenceEvents(fenceId: string, limit = 50) {
  return useQuery({
    queryKey: geofenceKeys.events(fenceId),
    queryFn: () => api.get<DataResponse<GeofenceEvent>>(`/v1/geofences/${fenceId}/events?limit=${limit}`),
    enabled: !!fenceId,
  });
}

export function useGeofenceDevices(fenceId: string) {
  return useQuery({
    queryKey: geofenceKeys.devices(fenceId),
    queryFn: () => api.get<DataResponse<GeofenceDeviceInside>>(`/v1/geofences/${fenceId}/devices`),
    enabled: !!fenceId,
  });
}
