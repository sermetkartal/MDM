"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { deviceKeys } from "@/hooks/queries/use-devices";
import type { Command, SendCommandRequest, BulkCommandRequest, BulkCommandResponse } from "@/lib/types";

export function useRemoteAction(deviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: SendCommandRequest) =>
      api.post<Command>(`/v1/devices/${deviceId}/commands`, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceKeys.detail(deviceId) });
    },
  });
}

export function useBulkAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: BulkCommandRequest) =>
      api.post<BulkCommandResponse>("/v1/commands/bulk", req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceKeys.all });
    },
  });
}
