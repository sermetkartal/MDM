"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Calendar, FileText, Clock, Play } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useReportTemplates } from "@/hooks/queries/use-reports";
import type { ReportTemplate } from "@/lib/types";

const templateIcons: Record<string, React.ReactNode> = {
  device_inventory: <BarChart3 className="h-8 w-8 text-blue-500" />,
  compliance_summary: <FileText className="h-8 w-8 text-red-500" />,
  app_usage: <BarChart3 className="h-8 w-8 text-green-500" />,
  enrollment: <Calendar className="h-8 w-8 text-purple-500" />,
  security_audit: <FileText className="h-8 w-8 text-orange-500" />,
};

function TemplateCard({ template }: { template: ReportTemplate }) {
  const router = useRouter();

  return (
    <Card className="flex flex-col justify-between p-6">
      <div>
        <div className="mb-3 flex items-center gap-3">
          {templateIcons[template.id] ?? (
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
          )}
          <h3 className="text-lg font-semibold">{template.name}</h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {template.description}
        </p>
        <div className="mb-4 flex flex-wrap gap-1">
          {template.filters.map((filter) => (
            <Badge key={filter} variant="secondary" className="text-xs">
              {filter.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() =>
            router.push(`/reports/generate?template=${template.id}`)
          }
        >
          <Play className="mr-2 h-4 w-4" />
          Generate
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() =>
            router.push(`/reports/scheduled?create=true&template=${template.id}`)
          }
        >
          <Clock className="mr-2 h-4 w-4" />
          Schedule
        </Button>
      </div>
    </Card>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const { data, isLoading } = useReportTemplates();
  const templates = data?.templates ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Generate and schedule reports across your device fleet"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/reports/scheduled")}
            >
              <Clock className="mr-2 h-4 w-4" />
              Scheduled Reports
            </Button>
            <Button onClick={() => router.push("/reports/generate")}>
              <Play className="mr-2 h-4 w-4" />
              Generate Report
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="mb-3 h-8 w-8" />
              <Skeleton className="mb-2 h-5 w-3/4" />
              <Skeleton className="mb-4 h-12 w-full" />
              <Skeleton className="h-10 w-full" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      )}
    </div>
  );
}
