"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Shield, Key, RefreshCw, CheckCircle2, XCircle, Apple } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api-client";
interface AppleSettings {
  apns_cert_uploaded: boolean;
  apns_cert_expiry: string | null;
  apns_topic: string | null;
  dep_token_configured: boolean;
  dep_server_name: string | null;
  mdm_signing_cert_uploaded: boolean;
}

export default function AppleSettingsPage() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings", "apple"],
    queryFn: () => api.get<AppleSettings>("/v1/settings/apple"),
  });

  const uploadAPNsCert = useMutation({
    mutationFn: (formData: FormData) =>
      api.post("/v1/settings/apple/apns-cert", formData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "apple"] }),
  });

  const uploadDEPToken = useMutation({
    mutationFn: (formData: FormData) =>
      api.post("/v1/settings/apple/dep-token", formData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "apple"] }),
  });

  const uploadSigningCert = useMutation({
    mutationFn: (formData: FormData) =>
      api.post("/v1/settings/apple/signing-cert", formData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "apple"] }),
  });

  const handleFileUpload = (
    mutation: typeof uploadAPNsCert,
    fieldName: string,
  ) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append(fieldName, file);
    mutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Apple MDM Settings"
        description="Configure APNs certificates, DEP tokens, and MDM signing certificates for iOS device management"
      />

      {/* APNs Certificate */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">APNs Certificate</CardTitle>
              <CardDescription>
                Apple Push Notification service certificate for sending MDM push notifications
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <StatusIndicator
              active={settings?.apns_cert_uploaded ?? false}
              label={settings?.apns_cert_uploaded ? "Certificate uploaded" : "No certificate"}
            />
            {settings?.apns_cert_expiry && (
              <span className="text-xs text-muted-foreground">
                Expires: {new Date(settings.apns_cert_expiry).toLocaleDateString()}
              </span>
            )}
            {settings?.apns_topic && (
              <Badge variant="secondary" className="font-mono text-xs">
                {settings.apns_topic}
              </Badge>
            )}
          </div>
          <Separator />
          <div>
            <label className="text-sm font-medium">Upload APNs Push Certificate (.pem)</label>
            <div className="mt-2 flex items-center gap-3">
              <Input
                type="file"
                accept=".pem,.p12,.pfx"
                onChange={handleFileUpload(uploadAPNsCert, "apns_cert")}
                className="max-w-sm"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={uploadAPNsCert.isPending}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploadAPNsCert.isPending ? "Uploading..." : "Upload"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Obtain from the Apple Push Certificates Portal (identity.apple.com)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* DEP / Apple Business Manager Token */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Apple className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">
                DEP / Apple Business Manager Token
              </CardTitle>
              <CardDescription>
                Server token for Device Enrollment Program (DEP) integration with Apple Business Manager
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <StatusIndicator
              active={settings?.dep_token_configured ?? false}
              label={settings?.dep_token_configured ? "Token configured" : "No token"}
            />
            {settings?.dep_server_name && (
              <span className="text-sm text-muted-foreground">
                Server: {settings.dep_server_name}
              </span>
            )}
          </div>
          <Separator />
          <div>
            <label className="text-sm font-medium">Upload DEP Server Token (.p7m)</label>
            <div className="mt-2 flex items-center gap-3">
              <Input
                type="file"
                accept=".p7m"
                onChange={handleFileUpload(uploadDEPToken, "dep_token")}
                className="max-w-sm"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={uploadDEPToken.isPending}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploadDEPToken.isPending ? "Uploading..." : "Upload"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Download the server token from Apple Business Manager after adding your MDM server
            </p>
          </div>
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync DEP Devices
          </Button>
        </CardContent>
      </Card>

      {/* MDM Signing Certificate */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Key className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">MDM Signing Certificate</CardTitle>
              <CardDescription>
                Certificate used to sign configuration profiles for iOS devices
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusIndicator
            active={settings?.mdm_signing_cert_uploaded ?? false}
            label={settings?.mdm_signing_cert_uploaded ? "Signing cert uploaded" : "No signing certificate"}
          />
          <Separator />
          <div>
            <label className="text-sm font-medium">Upload Signing Certificate (.pem)</label>
            <div className="mt-2 flex items-center gap-3">
              <Input
                type="file"
                accept=".pem,.p12,.pfx"
                onChange={handleFileUpload(uploadSigningCert, "signing_cert")}
                className="max-w-sm"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={uploadSigningCert.isPending}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploadSigningCert.isPending ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Upload Signing Key (.pem)</label>
            <div className="mt-2 flex items-center gap-3">
              <Input
                type="file"
                accept=".pem,.key"
                className="max-w-sm"
              />
              <Button variant="outline" size="sm">
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusIndicator({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {active ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-sm">{label}</span>
    </div>
  );
}
