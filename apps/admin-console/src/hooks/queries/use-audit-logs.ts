"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AuditLog, ListAuditLogsParams, PaginatedResponse } from "@/lib/types";

export const auditKeys = {
  all: ["audit-logs"] as const,
  lists: () => [...auditKeys.all, "list"] as const,
  list: (params: ListAuditLogsParams) => [...auditKeys.lists(), params] as const,
  details: () => [...auditKeys.all, "detail"] as const,
  detail: (id: string) => [...auditKeys.details(), id] as const,
};

function buildQueryString(params: ListAuditLogsParams, page: number): string {
  const entries: [string, string][] = [["page", String(page)]];
  if (params.page_size) entries.push(["page_size", String(params.page_size)]);
  if (params.actor_type) entries.push(["actor_type", params.actor_type]);
  if (params.action) entries.push(["action", params.action]);
  if (params.resource_type) entries.push(["resource_type", params.resource_type]);
  if (params.from) entries.push(["from", params.from]);
  if (params.to) entries.push(["to", params.to]);
  if (params.search) entries.push(["search", params.search]);
  return new URLSearchParams(entries).toString();
}

export function useAuditLogs(params: ListAuditLogsParams = {}) {
  return useInfiniteQuery({
    queryKey: auditKeys.list(params),
    queryFn: ({ pageParam = 1 }) =>
      api.get<PaginatedResponse<AuditLog>>(
        `/v1/audit?${buildQueryString(params, pageParam)}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
  });
}

export function useAuditLogDetail(id: string) {
  return useQuery({
    queryKey: auditKeys.detail(id),
    queryFn: () => api.get<AuditLog>(`/v1/audit/${id}`),
    enabled: !!id,
  });
}
