"use client";

import { useState } from "react";
import { ShieldCheck, Upload, Download, XCircle, Key } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useCertificates,
  useRevokeCertificate,
  useUploadCACert,
  useSCEPConfig,
} from "@/hooks/queries/use-certificates";
import type { Certificate, ExpiryStatus, ListCertificatesParams } from "@/lib/types";

const expiryBadge: Record<ExpiryStatus, { variant: "default" | "destructive" | "warning" | "secondary"; label: string }> = {
  active: { variant: "default", label: "Active" },
  expiring_warning: { variant: "warning", label: "Expiring Soon" },
  expiring_critical: { variant: "destructive", label: "Expiring" },
  expired: { variant: "destructive", label: "Expired" },
  revoked: { variant: "secondary", label: "Revoked" },
};

function ExpiryBadge({ status }: { status: ExpiryStatus }) {
  const config = expiryBadge[status] ?? expiryBadge.active;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function formatDate(date: string | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysUntil(date: string | null): string {
  if (!date) return "-";
  const diff = Math.ceil(
    (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return "Expired";
  if (diff === 0) return "Today";
  return `${diff}d`;
}

export default function CertificatesPage() {
  const [params, setParams] = useState<ListCertificatesParams>({ page: 1, limit: 25 });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [caName, setCaName] = useState("");
  const [caPem, setCaPem] = useState("");

  const { data, isLoading } = useCertificates(params);
  const revokeMutation = useRevokeCertificate();
  const uploadMutation = useUploadCACert();
  const { data: scepConfig } = useSCEPConfig();

  const certificates = data?.data ?? [];

  const columns: Column<Certificate & { expiryStatus?: ExpiryStatus; [key: string]: unknown }>[] = [
    {
      key: "subject",
      header: "Subject",
      sortable: true,
      render: (row) => (
        <div className="font-medium">{row.subject ?? row.name}</div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => (
        <Badge variant="secondary" className="capitalize">
          {row.type}
        </Badge>
      ),
    },
    {
      key: "serialNumber",
      header: "Serial",
      render: (row) => (
        <code className="text-xs">
          {row.serialNumber ? row.serialNumber.substring(0, 16) + "..." : "-"}
        </code>
      ),
    },
    {
      key: "createdAt",
      header: "Issued",
      sortable: true,
      render: (row) => formatDate(row.createdAt),
    },
    {
      key: "notAfter",
      header: "Expires",
      sortable: true,
      render: (row) => (
        <span>
          {formatDate(row.notAfter)}{" "}
          <span className="text-xs text-muted-foreground">
            ({daysUntil(row.notAfter)})
          </span>
        </span>
      ),
    },
    {
      key: "expiryStatus",
      header: "Status",
      render: (row) => (
        <ExpiryBadge status={(row.expiryStatus as ExpiryStatus) ?? (row.status === "revoked" ? "revoked" : "active")} />
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) =>
        row.status !== "revoked" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Revoke this certificate? This action cannot be undone.")) {
                revokeMutation.mutate(row.id);
              }
            }}
          >
            <XCircle className="mr-1 h-4 w-4" />
            Revoke
          </Button>
        ) : null,
    },
  ];

  const handleUploadCA = () => {
    if (!caName || !caPem) return;
    uploadMutation.mutate(
      { name: caName, certPem: caPem },
      {
        onSuccess: () => {
          setUploadOpen(false);
          setCaName("");
          setCaPem("");
        },
      },
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCaPem(reader.result as string);
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificates"
        description="Manage device certificates, CA certificates, and SCEP enrollment"
        actions={
          <div className="flex items-center gap-2">
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload CA Cert
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload CA Certificate</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={caName}
                      onChange={(e) => setCaName(e.target.value)}
                      placeholder="e.g., Corporate Root CA"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      Certificate File (.pem, .crt)
                    </label>
                    <Input
                      type="file"
                      accept=".pem,.crt,.cer"
                      onChange={handleFileChange}
                    />
                  </div>
                  {caPem && (
                    <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                      {caPem.substring(0, 200)}...
                    </pre>
                  )}
                  <Button onClick={handleUploadCA} disabled={!caName || !caPem}>
                    Upload
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* SCEP Config Info */}
      {scepConfig && (
        <div className="flex items-center gap-4 rounded-lg border bg-muted/50 p-4">
          <Key className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1 text-sm">
            <span className="font-medium">SCEP Enrollment URL:</span>{" "}
            <code className="rounded bg-background px-1.5 py-0.5">
              {scepConfig.scepUrl}
            </code>
          </div>
          <div className="text-sm">
            <span className="font-medium">Challenge:</span>{" "}
            <code className="rounded bg-background px-1.5 py-0.5">
              {scepConfig.challengePassword}
            </code>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[
          { label: "All", value: undefined },
          { label: "Device", value: "device" as const },
          { label: "CA", value: "ca" as const },
          { label: "Client", value: "client" as const },
        ].map((tab) => (
          <Button
            key={tab.label}
            variant={params.type === tab.value ? "default" : "outline"}
            size="sm"
            onClick={() => setParams((p) => ({ ...p, type: tab.value, page: 1 }))}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={certificates as (Certificate & { [key: string]: unknown })[]}
        searchKey="subject"
        searchPlaceholder="Search by subject..."
      />
    </div>
  );
}
