"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useReportData, useReportJob } from "@/hooks/queries/use-reports";
import { formatDate } from "@/lib/utils";
import type { ReportFormat } from "@/lib/types";

export default function ReportViewerPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const router = useRouter();

  const { data: jobStatus, isLoading: jobLoading } = useReportJob(reportId);
  const { data: reportData, isLoading: dataLoading } =
    useReportData(reportId);

  const [sortCol, setSortCol] = React.useState<number | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const handleSort = (colIndex: number) => {
    if (sortCol === colIndex) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(colIndex);
      setSortDir("asc");
    }
  };

  const sortedRows = React.useMemo(() => {
    if (!reportData?.rows || sortCol === null) return reportData?.rows ?? [];
    return [...reportData.rows].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [reportData?.rows, sortCol, sortDir]);

  const handleDownload = (format: ReportFormat) => {
    window.open(`/api/v1/reports/${reportId}/download?format=${format}`, "_blank");
  };

  const isLoading = jobLoading || dataLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (jobStatus?.status === "processing" || jobStatus?.status === "queued") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-lg font-medium">Report is still generating...</p>
        <p className="text-sm text-muted-foreground">
          {jobStatus.progress_percent}% complete
        </p>
      </div>
    );
  }

  const summaryEntries = reportData?.summary
    ? Object.entries(reportData.summary).filter(
        ([, v]) => typeof v === "string" || typeof v === "number",
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title={reportData?.title ?? "Report"}
          description={
            reportData?.generated_at
              ? `Generated ${formatDate(reportData.generated_at)}`
              : undefined
          }
          actions={
            <div className="flex gap-2">
              {(["csv", "pdf", "xlsx"] as ReportFormat[]).map((f) => (
                <Button
                  key={f}
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(f)}
                >
                  <Download className="mr-1 h-3 w-3" />
                  {f.toUpperCase()}
                </Button>
              ))}
            </div>
          }
        />
      </div>

      {/* Summary cards */}
      {summaryEntries.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {summaryEntries.map(([key, value]) => (
            <Card key={key} className="p-4">
              <p className="text-sm text-muted-foreground">
                {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </p>
              <p className="text-2xl font-bold">{String(value)}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Data table */}
      {reportData?.columns && (
        <div className="rounded-md border">
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  {reportData.columns.map((col, i) => (
                    <TableHead key={col.key}>
                      <button
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={() => handleSort(i)}
                      >
                        {col.label}
                        {sortCol === i ? (
                          sortDir === "asc" ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-4 w-4 opacity-50" />
                        )}
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={reportData.columns.length}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No data available
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRows.map((row, rowIdx) => (
                    <TableRow key={rowIdx}>
                      {row.map((cell, cellIdx) => {
                        const col = reportData.columns[cellIdx];
                        let display = cell !== null && cell !== undefined ? String(cell) : "-";
                        if (col?.type === "date" && cell) {
                          display = formatDate(String(cell));
                        }
                        if (col?.type === "boolean") {
                          display = cell ? "Yes" : "No";
                        }

                        // Compliance status coloring
                        const isCompliance =
                          col?.key?.includes("compliance") ||
                          col?.label?.toLowerCase().includes("compliance");
                        const cellStr = String(cell ?? "").toUpperCase();

                        return (
                          <TableCell key={cellIdx}>
                            {isCompliance ? (
                              <Badge
                                variant={
                                  cellStr === "COMPLIANT"
                                    ? "default"
                                    : cellStr === "NON_COMPLIANT"
                                      ? "destructive"
                                      : "secondary"
                                }
                              >
                                {display}
                              </Badge>
                            ) : (
                              display
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-4 py-2 text-sm text-muted-foreground">
            {sortedRows.length} row{sortedRows.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
