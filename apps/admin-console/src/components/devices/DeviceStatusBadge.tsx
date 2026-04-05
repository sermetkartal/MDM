import { Badge } from "@/components/ui/badge";
const statusConfig: Record<string, { label: string; variant: "success" | "destructive" | "secondary" | "warning" }> = {
  enrolled: { label: "Enrolled", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  blocked: { label: "Blocked", variant: "destructive" },
  wiped: { label: "Wiped", variant: "secondary" },
  retired: { label: "Retired", variant: "secondary" },
  online: { label: "Online", variant: "success" },
  offline: { label: "Offline", variant: "destructive" },
};

export function DeviceStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
