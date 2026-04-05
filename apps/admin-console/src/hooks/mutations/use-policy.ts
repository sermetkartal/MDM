"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Policy, CreatePolicyRequest, UpdatePolicyRequest, PolicyAssignment, PolicyAssignmentRequest } from "@/lib/types";

export const policyKeys = {
  all: ["policies"] as const,
  lists: () => [...policyKeys.all, "list"] as const,
  detail: (id: string) => [...policyKeys.all, id] as const,
};

export function useCreatePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: CreatePolicyRequest) =>
      api.post<Policy>("/v1/policies", req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: policyKeys.all });
    },
  });
}

export function useUpdatePolicy(policyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: UpdatePolicyRequest) =>
      api.patch<Policy>(`/v1/policies/${policyId}`, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: policyKeys.all });
    },
  });
}

export function useAssignPolicy(policyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: PolicyAssignmentRequest) =>
      api.post<PolicyAssignment>(`/v1/policies/${policyId}/assignments`, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: policyKeys.detail(policyId) });
    },
  });
}
