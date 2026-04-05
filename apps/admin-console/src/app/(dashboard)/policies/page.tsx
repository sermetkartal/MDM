"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Shield, MoreHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PolicyAssignmentModal } from "@/components/policies/PolicyAssignmentModal";
import { policyKeys } from "@/hooks/mutations/use-policy";
import { api } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils";
import type { PaginatedResponse, Policy } from "@/lib/types";

export default function PoliciesPage() {
  const router = useRouter();
  const [assignPolicyId, setAssignPolicyId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: policyKeys.lists(),
    queryFn: () => api.get<PaginatedResponse<Policy>>("/v1/policies?limit=50"),
  });

  const policies = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policies"
        description="Configure and manage device policies"
        actions={
          <Button onClick={() => router.push("/policies/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Policy
          </Button>
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Policy Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-12">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : policies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No policies found. Create your first policy.
                </TableCell>
              </TableRow>
            ) : (
              policies.map((policy) => {
                const policyType = (policy.payload?.type as string) ?? "unknown";
                return (
                  <TableRow key={policy.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{policy.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{policyType}</Badge>
                    </TableCell>
                    <TableCell>{policy.platform}</TableCell>
                    <TableCell>v{policy.version}</TableCell>
                    <TableCell>
                      <Badge variant={policy.isActive ? "success" : "secondary"}>
                        {policy.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatRelativeTime(policy.updatedAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => router.push(`/policies/${policy.id}/edit`)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setAssignPolicyId(policy.id)}>
                            Assign
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {assignPolicyId && (
        <PolicyAssignmentModal
          policyId={assignPolicyId}
          open={!!assignPolicyId}
          onOpenChange={(open) => !open && setAssignPolicyId(null)}
        />
      )}
    </div>
  );
}
