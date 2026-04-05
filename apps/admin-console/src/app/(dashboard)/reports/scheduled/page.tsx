"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Play, Trash2, Pencil } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { formatDate } from "@/lib/utils";
import type { ReportFormat } from "@/lib/types";

interface ReportSchedule {
  id: string;
  name: string;
  template_id: string;
  template_name: string;
  format: ReportFormat;
  cron_expression: string;
  cron_human: string;
  recipients: string[];
  is_active: boolean;
  last_run_at: string | null;
}

const DEMO_TEMPLATES = [
  { id: "t1", name: "Device Inventory" },
  { id: "t2", name: "Compliance Summary" },
  { id: "t3", name: "Security Incidents" },
  { id: "t4", name: "App Distribution" },
];

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
  const [editingSchedule, setEditingSchedule] = React.useState<ReportSchedule | null>(null);

  const [name, setName] = React.useState("");
  const [templateId, setTemplateId] = React.useState(preselectedTemplate);
  const [format, setFormat] = React.useState<ReportFormat>("pdf");
  const [cronExpression, setCronExpression] = React.useState("0 8 * * *");
  const [recipients, setRecipients] = React.useState("");

  const [schedules, setSchedules] = React.useState<ReportSchedule[]>([
    {
      id: "s1",
      name: "Weekly Compliance Report",
      template_id: "t2",
      template_name: "Compliance Summary",
      format: "pdf",
      cron_expression: "0 8 * * 1",
      cron_human: "Weekly on Monday at 8:00 AM",
      recipients: ["admin@example.com"],
      is_active: true,
      last_run_at: new Date(Date.now() - 604800000).toISOString(),
    },
    {
      id: "s2",
      name: "Daily Device Inventory",
      template_id: "t1",
      template_name: "Device Inventory",
      format: "csv",
      cron_expression: "0 8 * * *",
      cron_human: "Daily at 8:00 AM",
      recipients: ["it-ops@example.com"],
      is_active: true,
      last_run_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ]);

  const templates = DEMO_TEMPLATES;

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
    setRecipients(schedule.recipients.join(", "));
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const recipientList = recipients
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    const cronHuman = CRON_PRESETS.find(p => p.value === cronExpression)?.label ?? cronExpression;
    const templateName = templates.find(t => t.id === templateId)?.name ?? templateId;

    if (editingSchedule) {
      setSchedules(prev => prev.map(s => s.id === editingSchedule.id ? {
        ...s,
        name,
        template_id: templateId,
        template_name: templateName,
        format,
        cron_expression: cronExpression,
        cron_human: cronHuman,
        recipients: recipientList,
      } : s));
      alert("Schedule updated (demo mode)");
    } else {
      setSchedules(prev => [...prev, {
        id: `s-${Date.now()}`,
        name,
        template_id: templateId,
        template_name: templateName,
        format,
        cron_expression: cronExpression,
        cron_human: cronHuman,
        recipients: recipientList,
        is_active: true,
        last_run_at: null,
      }]);
      alert("Schedule created (demo mode)");
    }
    setDialogOpen(false);
    resetForm();
  };

  const handleRunNow = (id: string) => {
    alert("Report generation triggered (demo mode)");
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this scheduled report?")) {
      setSchedules(prev => prev.filter(s => s.id !== id));
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
            {schedules.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  No scheduled reports. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              schedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell className="font-medium">
                    {schedule.name}
                  </TableCell>
                  <TableCell>{schedule.template_name}</TableCell>
                  <TableCell className="text-sm">
                    {schedule.cron_human}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {schedule.format.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">
                    {schedule.recipients.join(", ")}
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
                        onClick={() => handleRunNow(schedule.id)}
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
                        onClick={() => handleDelete(schedule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
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
                disabled={!name || !templateId || !recipients}
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
