"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  DeviceGroup,
  GroupTreeNode,
  GroupMember,
  CreateGroupRequest,
  UpdateGroupRequest,
  RuleGroup,
  PaginatedResponse,
  PaginationParams,
  LdapIntegration,
  LdapSyncHistoryEntry,
  LdapConfig,
} from "@/lib/types";

// --- Query Keys ---

export const groupKeys = {
  all: ["groups"] as const,
  lists: () => [...groupKeys.all, "list"] as const,
  list: (params: PaginationParams) => [...groupKeys.lists(), params] as const,
  tree: () => [...groupKeys.all, "tree"] as const,
  details: () => [...groupKeys.all, "detail"] as const,
  detail: (id: string) => [...groupKeys.details(), id] as const,
  members: (id: string, params?: PaginationParams) => [...groupKeys.detail(id), "members", params] as const,
  policies: (id: string) => [...groupKeys.detail(id), "policies"] as const,
};

export const ldapKeys = {
  all: ["ldap"] as const,
  list: () => [...ldapKeys.all, "list"] as const,
  detail: (id: string) => [...ldapKeys.all, id] as const,
  history: (id: string) => [...ldapKeys.detail(id), "history"] as const,
};

// --- Group Queries ---

export function useGroups(params: PaginationParams = {}) {
  return useQuery({
    queryKey: groupKeys.list(params),
    queryFn: () =>
      api.get<PaginatedResponse<DeviceGroup>>(
        `/v1/groups?${new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== "")
            .map(([k, v]) => [k, String(v)]),
        ).toString()}`,
      ),
  });
}

export function useGroupTree() {
  return useQuery({
    queryKey: groupKeys.tree(),
    queryFn: () => api.get<{ data: GroupTreeNode[] }>("/v1/groups/tree"),
  });
}

export function useGroup(groupId: string) {
  return useQuery({
    queryKey: groupKeys.detail(groupId),
    queryFn: () => api.get<DeviceGroup>(`/v1/groups/${groupId}`),
    enabled: !!groupId,
  });
}

export function useGroupMembers(groupId: string, params: PaginationParams = {}) {
  return useQuery({
    queryKey: groupKeys.members(groupId, params),
    queryFn: () =>
      api.get<PaginatedResponse<GroupMember>>(
        `/v1/groups/${groupId}/members?${new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== "")
            .map(([k, v]) => [k, String(v)]),
        ).toString()}`,
      ),
    enabled: !!groupId,
  });
}

export function useGroupPolicies(groupId: string) {
  return useQuery({
    queryKey: groupKeys.policies(groupId),
    queryFn: () =>
      api.get<{ data: any[]; inherited: any[] }>(`/v1/groups/${groupId}/policies`),
    enabled: !!groupId,
  });
}

// --- Group Mutations ---

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGroupRequest) =>
      api.post<DeviceGroup>("/v1/groups", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
}

export function useUpdateGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateGroupRequest) =>
      api.patch<DeviceGroup>(`/v1/groups/${groupId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) =>
      api.delete<{ message: string; warnings: string[] }>(`/v1/groups/${groupId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
}

export function useAddDevicesToGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceIds: string[]) =>
      api.post<{ added: number }>(`/v1/groups/${groupId}/devices`, { device_ids: deviceIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.members(groupId) });
    },
  });
}

export function useRemoveDeviceFromGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) =>
      api.delete(`/v1/groups/${groupId}/devices/${deviceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.members(groupId) });
    },
  });
}

export function useEvaluateGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ message: string; added: number; removed: number }>(`/v1/groups/${groupId}/evaluate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.members(groupId) });
    },
  });
}

export function usePreviewRules() {
  return useMutation({
    mutationFn: (rules: RuleGroup) =>
      api.post<{ count: number; deviceIds: string[] }>("/v1/groups/preview-rules", rules),
  });
}

export function useAssignPolicyToGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (policyId: string) =>
      api.post(`/v1/groups/${groupId}/policies`, { policyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.policies(groupId) });
    },
  });
}

// --- LDAP Queries ---

export function useLdapIntegrations() {
  return useQuery({
    queryKey: ldapKeys.list(),
    queryFn: () => api.get<{ data: LdapIntegration[] }>("/v1/ldap"),
  });
}

export function useLdapSyncHistory(integrationId: string) {
  return useQuery({
    queryKey: ldapKeys.history(integrationId),
    queryFn: () => api.get<{ data: LdapSyncHistoryEntry[] }>(`/v1/ldap/${integrationId}/history`),
    enabled: !!integrationId,
  });
}

export function useCreateLdapIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; config: LdapConfig }) =>
      api.post<LdapIntegration>("/v1/ldap", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ldapKeys.all });
    },
  });
}

export function useUpdateLdapIntegration(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; config?: Partial<LdapConfig>; isActive?: boolean }) =>
      api.patch<LdapIntegration>(`/v1/ldap/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ldapKeys.all });
    },
  });
}

export function useDeleteLdapIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/ldap/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ldapKeys.all });
    },
  });
}

export function useTestLdapConnection() {
  return useMutation({
    mutationFn: (config: LdapConfig) =>
      api.post<{ success: boolean; message: string; userCount?: number; groupCount?: number }>(
        "/v1/ldap/test-connection",
        config,
      ),
  });
}

export function useSyncLdap(integrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ status: string; usersSynced: number; groupsSynced: number; errors: string[] }>(
        `/v1/ldap/${integrationId}/sync`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ldapKeys.all });
      queryClient.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
}
