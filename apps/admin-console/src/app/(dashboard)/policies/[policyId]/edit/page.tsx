"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/PageHeader";
import { PolicyForm, type PolicyFormData } from "@/components/policies/PolicyForm";
import { useUpdatePolicy, policyKeys } from "@/hooks/mutations/use-policy";
import { api } from "@/lib/api-client";
import type { Policy } from "@/lib/types";

export default function EditPolicyPage() {
  const params = useParams();
  const router = useRouter();
  const policyId = params.policyId as string;

  const { data: policy, isLoading } = useQuery({
    queryKey: policyKeys.detail(policyId),
    queryFn: () => api.get<Policy>(`/v1/policies/${policyId}`),
    enabled: !!policyId,
  });

  const updatePolicy = useUpdatePolicy(policyId);

  const handleSubmit = (data: PolicyFormData) => {
    updatePolicy.mutate(
      {
        name: data.name,
        description: data.description || undefined,
        payload: { ...data.payload, type: data.policyType },
        isActive: data.isActive,
      },
      {
        onSuccess: () => router.push("/policies"),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!policy) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Policy not found.</div>;
  }

  const policyType = (policy.payload?.type as string) ?? "restriction";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/policies">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader title={`Edit: ${policy.name}`} description="Update policy configuration" />
      </div>
      <PolicyForm
        initialData={{
          name: policy.name,
          description: policy.description ?? "",
          platform: policy.platform,
          policyType: policyType as PolicyFormData["policyType"],
          payload: policy.payload,
          isActive: policy.isActive,
        }}
        onSubmit={handleSubmit}
        isPending={updatePolicy.isPending}
        submitLabel="Update Policy"
      />
    </div>
  );
}
