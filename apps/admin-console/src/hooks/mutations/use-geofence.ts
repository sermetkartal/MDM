"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { geofenceKeys } from "@/hooks/queries/use-geofences";
import type {
  Geofence,
  GeofencePolicy,
  CreateGeofenceRequest,
  UpdateGeofenceRequest,
  CreateGeofencePolicyRequest,
} from "@/lib/types";

export function useCreateGeofence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: CreateGeofenceRequest) =>
      api.post<Geofence>("/v1/geofences", req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: geofenceKeys.all });
    },
  });
}

export function useUpdateGeofence(fenceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: UpdateGeofenceRequest) =>
      api.patch<Geofence>(`/v1/geofences/${fenceId}`, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: geofenceKeys.all });
    },
  });
}

export function useDeleteGeofence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fenceId: string) =>
      api.delete(`/v1/geofences/${fenceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: geofenceKeys.all });
    },
  });
}

export function useAddGeofencePolicy(fenceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: CreateGeofencePolicyRequest) =>
      api.post<GeofencePolicy>(`/v1/geofences/${fenceId}/policies`, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: geofenceKeys.policies(fenceId) });
    },
  });
}

export function useDeleteGeofencePolicy(fenceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (policyId: string) =>
      api.delete(`/v1/geofences/${fenceId}/policies/${policyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: geofenceKeys.policies(fenceId) });
    },
  });
}
