"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { PolicyForm, type PolicyFormData } from "@/components/policies/PolicyForm";
import { useCreatePolicy } from "@/hooks/mutations/use-policy";

export default function NewPolicyPage() {
  const router = useRouter();
  const createPolicy = useCreatePolicy();

  const handleSubmit = (data: PolicyFormData) => {
    createPolicy.mutate(
      {
        name: data.name,
        description: data.description || undefined,
        platform: data.platform,
        payload: { ...data.payload, type: data.policyType },
      },
      {
        onSuccess: () => router.push("/policies"),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/policies">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader title="Create Policy" description="Define a new device management policy" />
      </div>
      <PolicyForm onSubmit={handleSubmit} isPending={createPolicy.isPending} submitLabel="Create Policy" />
    </div>
  );
}
