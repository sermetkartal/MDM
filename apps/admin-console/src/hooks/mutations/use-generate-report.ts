"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { reportKeys } from "@/hooks/queries/use-reports";
import type {
  GenerateReportRequest,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  ReportSchedule,
} from "@/lib/types";

export function useGenerateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: GenerateReportRequest) =>
      api.post<{ job_id: string; status: string }>("/v1/reports/generate", req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.jobs() });
    },
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: CreateScheduleRequest) =>
      api.post<ReportSchedule>("/v1/reports/schedules", req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.schedules() });
    },
  });
}

export function useUpdateSchedule(scheduleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: UpdateScheduleRequest) =>
      api.patch<ReportSchedule>(`/v1/reports/schedules/${scheduleId}`, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.schedules() });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/reports/schedules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.schedules() });
    },
  });
}

export function useRunScheduleNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ job_id: string; status: string }>(
        `/v1/reports/schedules/${id}/run-now`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.jobs() });
    },
  });
}
