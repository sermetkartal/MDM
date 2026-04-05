"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  Certificate,
  ListCertificatesParams,
  PaginatedResponse,
  DataResponse,
  SCEPConfig,
} from "@/lib/types";

export const certificateKeys = {
  all: ["certificates"] as const,
  lists: () => [...certificateKeys.all, "list"] as const,
  list: (params: ListCertificatesParams) =>
    [...certificateKeys.lists(), params] as const,
  details: () => [...certificateKeys.all, "detail"] as const,
  detail: (id: string) => [...certificateKeys.details(), id] as const,
  ca: () => [...certificateKeys.all, "ca"] as const,
  scepConfig: () => [...certificateKeys.all, "scep-config"] as const,
};

export function useCertificates(params: ListCertificatesParams = {}) {
  return useQuery({
    queryKey: certificateKeys.list(params),
    queryFn: () =>
      api.get<PaginatedResponse<Certificate>>(
        `/v1/certificates?${new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== "")
            .map(([k, v]) => [k, String(v)]),
        ).toString()}`,
      ),
  });
}

export function useCertificate(id: string) {
  return useQuery({
    queryKey: certificateKeys.detail(id),
    queryFn: () => api.get<Certificate>(`/v1/certificates/${id}`),
    enabled: !!id,
  });
}

export function useCACertificates() {
  return useQuery({
    queryKey: certificateKeys.ca(),
    queryFn: () => api.get<DataResponse<Certificate>>("/v1/certificates/ca"),
  });
}

export function useSCEPConfig() {
  return useQuery({
    queryKey: certificateKeys.scepConfig(),
    queryFn: () => api.get<SCEPConfig>("/v1/certificates/scep-config"),
  });
}

export function useRevokeCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/v1/certificates/revoke/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: certificateKeys.all });
    },
  });
}

export function useUploadCACert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; certPem: string }) =>
      api.post("/v1/certificates/ca", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: certificateKeys.all });
    },
  });
}
