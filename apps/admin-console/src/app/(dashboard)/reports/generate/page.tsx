"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Loader2, CheckCircle, XCircle } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useReportTemplates, useReportJob } from "@/hooks/queries/use-reports";
import { useGenerateReport } from "@/hooks/mutations/use-generate-report";
import type { ReportFormat } from "@/lib/types";

export default function GenerateReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedTemplate = searchParams.get("template") ?? "";

  const [templateId, setTemplateId] = React.useState(preselectedTemplate);
  const [format, setFormat] = React.useState<ReportFormat>("pdf");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [activeJobId, setActiveJobId] = React.useState<string | null>(null);

  const { data: templateData } = useReportTemplates();
  const templates = templateData?.templates ?? [];
  const selectedTemplate = templates.find((t) => t.id === templateId);

  const generateMutation = useGenerateReport();

  const { data: currentJob } = useReportJob(activeJobId ?? "", {
    enabled: !!activeJobId,
    refetchInterval: activeJobId ? 1000 : false,
  });

  const handleGenerate = () => {
    if (!templateId) return;

    generateMutation.mutate(
      {
        template_id: templateId,
        org_id: "00000000-0000-0000-0000-000000000001", // TODO: from auth context
        format,
        params: {
          from: dateFrom || undefined,
          to: dateTo || undefined,
        },
      },
      {
        onSuccess: (data) => {
          setActiveJobId(data.job_id);
        },
      },
    );
  };

  const handleDownload = () => {
    if (currentJob?.download_url) {
      window.open(currentJob.download_url, "_blank");
    }
  };

  const progressPercent = currentJob?.progress_percent ?? 0;
  const isRunning =
    currentJob?.status === "queued" || currentJob?.status === "processing";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Generate Report"
        description="Configure and generate a new report"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Configuration */}
        <Card className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Report Template
            </label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">Select a template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedTemplate.description}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Date From
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Date To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Export Format
            </label>
            <div className="flex gap-2">
              {(["pdf", "csv", "xlsx"] as ReportFormat[]).map((f) => (
                <Button
                  key={f}
                  variant={format === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormat(f)}
                >
                  {f.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleGenerate}
            disabled={!templateId || generateMutation.isPending || isRunning}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : isRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate Report"
            )}
          </Button>
        </Card>

        {/* Progress / Result */}
        <Card className="flex flex-col items-center justify-center p-6">
          {!activeJobId ? (
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">Ready to generate</p>
              <p className="text-sm">
                Select a template and click Generate to start
              </p>
            </div>
          ) : currentJob?.status === "completed" ? (
            <div className="space-y-4 text-center">
              <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
              <p className="text-lg font-semibold">Report Ready</p>
              <div className="flex gap-2">
                <Button onClick={handleDownload}>
                  <Download className="mr-2 h-4 w-4" />
                  Download {format.toUpperCase()}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    router.push(`/reports/${activeJobId}`)
                  }
                >
                  View Report
                </Button>
              </div>
            </div>
          ) : currentJob?.status === "failed" ? (
            <div className="space-y-4 text-center">
              <XCircle className="mx-auto h-16 w-16 text-red-500" />
              <p className="text-lg font-semibold">Generation Failed</p>
              <p className="text-sm text-muted-foreground">
                {currentJob.error ?? "An unexpected error occurred"}
              </p>
              <Button variant="outline" onClick={handleGenerate}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="w-full space-y-4">
              <div className="text-center">
                <Loader2 className="mx-auto mb-2 h-12 w-12 animate-spin text-primary" />
                <p className="text-lg font-semibold">
                  {currentJob?.status === "queued"
                    ? "Queued..."
                    : "Generating Report..."}
                </p>
              </div>
              <div className="w-full">
                <div className="mb-1 flex justify-between text-sm text-muted-foreground">
                  <span>Progress</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
