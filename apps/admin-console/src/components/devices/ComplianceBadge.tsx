import { Badge } from "@/components/ui/badge";

const complianceConfig: Record<string, { label: string; variant: "success" | "destructive" | "warning" }> = {
  compliant: { label: "Compliant", variant: "success" },
  non_compliant: { label: "Non-Compliant", variant: "destructive" },
  unknown: { label: "Unknown", variant: "warning" },
  pending: { label: "Pending", variant: "warning" },
};

export function ComplianceBadge({ status }: { status: string }) {
  const config = complianceConfig[status] ?? { label: status, variant: "warning" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
