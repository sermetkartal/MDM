"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import type { ReportFormat } from "@/lib/types";

export default function ReportViewerPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const router = useRouter();

  const reportData = {
    id: reportId,
    title: "Device Inventory Report",
    status: "completed",
    generated_at: new Date().toISOString(),
    format: "pdf",
    summary: { total_devices: 45, online: 38, compliant: 41 } as Record<string, string | number>,
    columns: [
      { key: "serial", label: "Serial", type: "string" },
      { key: "model", label: "Model", type: "string" },
      { key: "os", label: "OS", type: "string" },
      { key: "status", label: "Status", type: "string" },
      { key: "compliance", label: "Compliance", type: "string" },
    ],
    rows: [
      ["WH-001", "Galaxy Tab A8", "Android 14", "Online", "Compliant"],
      ["RT-POS-01", "Pixel Tablet", "Android 14", "Online", "Non-Compliant"],
      ["FLD-007", "Galaxy A54", "Android 13", "Offline", "Compliant"],
      ["WH-002", "Galaxy Tab A8", "Android 14", "Online", "Compliant"],
      ["FLD-012", "Pixel 7a", "Android 14", "Online", "Compliant"],
    ] as (string | number | boolean | null)[][],
  };
  const isLoading = false;

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
    alert(`Downloading report as ${format.toUpperCase()} (demo mode)`);
  };

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
                                    : cellStr === "NON-COMPLIANT"
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
