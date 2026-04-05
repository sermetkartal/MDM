"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Play, Trash2, Pencil } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useReportSchedules,
  useReportTemplates,
} from "@/hooks/queries/use-reports";
import {
  useCreateSchedule,
  useDeleteSchedule,
  useRunScheduleNow,
  useUpdateSchedule,
} from "@/hooks/mutations/use-generate-report";
import { formatDate } from "@/lib/utils";
import type { ReportFormat, ReportSchedule } from "@/lib/types";

const CRON_PRESETS = [
  { label: "Daily at 8:00 AM", value: "0 8 * * *" },
  { label: "Weekly on Monday at 8:00 AM", value: "0 8 * * 1" },
  { label: "Monthly on the 1st at 8:00 AM", value: "0 8 1 * *" },
];

export default function ScheduledReportsPage() {
  const searchParams = useSearchParams();
  const shouldCreate = searchParams.get("create") === "true";
  const preselectedTemplate = searchParams.get("template") ?? "";

  const [dialogOpen, setDialogOpen] = React.useState(shouldCreate);
  const [editingSchedule, setEditingSchedule] =
    React.useState<ReportSchedule | null>(null);

  // Form state
  const [name, setName] = React.useState("");
  const [templateId, setTemplateId] = React.useState(preselectedTemplate);
  const [format, setFormat] = React.useState<ReportFormat>("pdf");
  const [cronExpression, setCronExpression] = React.useState("0 8 * * *");
  const [recipients, setRecipients] = React.useState("");

  const { data: scheduleData, isLoading } = useReportSchedules();
  const { data: templateData } = useReportTemplates();
  const schedules = scheduleData?.schedules ?? [];
  const templates = templateData?.templates ?? [];

  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule(editingSchedule?.id ?? "");
  const deleteSchedule = useDeleteSchedule();
  const runNow = useRunScheduleNow();

  const resetForm = () => {
    setName("");
    setTemplateId("");
    setFormat("pdf");
    setCronExpression("0 8 * * *");
    setRecipients("");
    setEditingSchedule(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (schedule: ReportSchedule) => {
    setEditingSchedule(schedule);
    setName(schedule.name);
    setTemplateId(schedule.template_id);
    setFormat(schedule.format);
    setCronExpression(schedule.cron_expression);
    setRecipients(
      Array.isArray(schedule.recipients)
        ? schedule.recipients.join(", ")
        : "",
    );
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const recipientList = recipients
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    if (editingSchedule) {
      updateSchedule.mutate(
        {
          name,
          template_id: templateId,
          format,
          cron_expression: cronExpression,
          recipients: recipientList,
        },
        {
          onSuccess: () => {
            setDialogOpen(false);
            resetForm();
          },
        },
      );
    } else {
      createSchedule.mutate(
        {
          org_id: "00000000-0000-0000-0000-000000000001",
          name,
          template_id: templateId,
          format,
          cron_expression: cronExpression,
          recipients: recipientList,
        },
        {
          onSuccess: () => {
            setDialogOpen(false);
            resetForm();
          },
        },
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduled Reports"
        description="Manage automated report generation and delivery"
        actions={
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Schedule
          </Button>
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Recipients</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-36">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : schedules.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  No scheduled reports. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              schedules.map((schedule) => {
                const template = templates.find(
                  (t) => t.id === schedule.template_id,
                );
                return (
                  <TableRow key={schedule.id}>
                    <TableCell className="font-medium">
                      {schedule.name}
                    </TableCell>
                    <TableCell>{template?.name ?? schedule.template_id}</TableCell>
                    <TableCell className="text-sm">
                      {schedule.cron_human ?? schedule.cron_expression}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {schedule.format.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {Array.isArray(schedule.recipients)
                        ? schedule.recipients.join(", ")
                        : ""}
                    </TableCell>
                    <TableCell className="text-sm">
                      {schedule.last_run_at
                        ? formatDate(schedule.last_run_at)
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={schedule.is_active ? "default" : "secondary"}
                      >
                        {schedule.is_active ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Run Now"
                          onClick={() => runNow.mutate(schedule.id)}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Edit"
                          onClick={() => openEditDialog(schedule)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500"
                          title="Delete"
                          onClick={() => deleteSchedule.mutate(schedule.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? "Edit Schedule" : "Create Scheduled Report"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <Input
                placeholder="e.g., Weekly Compliance Report"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

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
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Schedule
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
              >
                {CRON_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
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

            <div>
              <label className="mb-1 block text-sm font-medium">
                Recipients (comma-separated emails)
              </label>
              <Input
                placeholder="admin@example.com, manager@example.com"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  !name || !templateId || !recipients || createSchedule.isPending
                }
              >
                {editingSchedule ? "Update" : "Create Schedule"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

