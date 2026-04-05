"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface TelemetryDataPoint {
  time: string;
  battery: number | null;
  storage: number | null;
  memory: number | null;
  wifi_signal: number | null;
  location: { lat: number; lng: number } | null;
}

export interface LocationPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: string;
}

interface TelemetryResponse {
  data: TelemetryDataPoint[];
}

interface LocationHistoryResponse {
  data: LocationPoint[];
}

export const telemetryKeys = {
  all: ["telemetry"] as const,
  device: (deviceId: string) => [...telemetryKeys.all, deviceId] as const,
  data: (deviceId: string, range: string, interval: string) =>
    [...telemetryKeys.device(deviceId), "data", range, interval] as const,
  location: (deviceId: string, range: string) =>
    [...telemetryKeys.device(deviceId), "location", range] as const,
};

function getDateRange(range: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  switch (range) {
    case "24h":
      from.setHours(from.getHours() - 24);
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    default:
      from.setHours(from.getHours() - 24);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

function getIntervalForRange(range: string): string {
  switch (range) {
    case "24h":
      return "1h";
    case "7d":
      return "6h";
    case "30d":
      return "1d";
    default:
      return "1h";
  }
}

export function useDeviceTelemetry(deviceId: string, range: string = "24h") {
  const interval = getIntervalForRange(range);
  const { from, to } = getDateRange(range);

  return useQuery({
    queryKey: telemetryKeys.data(deviceId, range, interval),
    queryFn: () =>
      api.get<TelemetryResponse>(
        `/v1/devices/${deviceId}/telemetry?from=${from}&to=${to}&interval=${interval}`
      ),
    enabled: !!deviceId,
    refetchInterval: range === "24h" ? 300_000 : undefined,
  });
}

export function useDeviceLocationHistory(deviceId: string, range: string = "24h") {
  const { from, to } = getDateRange(range);

  return useQuery({
    queryKey: telemetryKeys.location(deviceId, range),
    queryFn: () =>
      api.get<LocationHistoryResponse>(
        `/v1/devices/${deviceId}/location-history?from=${from}&to=${to}`
      ),
    enabled: !!deviceId,
  });
}
