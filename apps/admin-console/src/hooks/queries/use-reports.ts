"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  ReportTemplate,
  ReportJob,
  ReportData,
  ReportSchedule,
} from "@/lib/types";

export const reportKeys = {
  all: ["reports"] as const,
  templates: () => [...reportKeys.all, "templates"] as const,
  jobs: () => [...reportKeys.all, "jobs"] as const,
  job: (id: string) => [...reportKeys.jobs(), id] as const,
  jobData: (id: string) => [...reportKeys.job(id), "data"] as const,
  schedules: () => [...reportKeys.all, "schedules"] as const,
  schedule: (id: string) => [...reportKeys.schedules(), id] as const,
};

export function useReportTemplates() {
  return useQuery({
    queryKey: reportKeys.templates(),
    queryFn: () =>
      api.get<{ templates: ReportTemplate[] }>("/v1/reports/templates"),
  });
}

export function useReportJob(jobId: string, options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery({
    queryKey: reportKeys.job(jobId),
    queryFn: () => api.get<ReportJob>(`/v1/reports/${jobId}/status`),
    enabled: options?.enabled ?? !!jobId,
    refetchInterval: options?.refetchInterval,
  });
}

export function useReportData(jobId: string) {
  return useQuery({
    queryKey: reportKeys.jobData(jobId),
    queryFn: () => api.get<ReportData>(`/v1/reports/${jobId}/data`),
    enabled: !!jobId,
  });
}

export function useReportSchedules(orgId?: string) {
  return useQuery({
    queryKey: reportKeys.schedules(),
    queryFn: () => {
      const params = orgId ? `?org_id=${orgId}` : "";
      return api.get<{ schedules: ReportSchedule[] }>(
        `/v1/reports/schedules${params}`,
      );
    },
  });
}
