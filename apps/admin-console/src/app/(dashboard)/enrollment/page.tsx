"use client";

import * as React from "react";
import { QrCode, Link2, Smartphone, Nfc, Settings } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function EnrollmentPage() {
  const [configName, setConfigName] = React.useState("Default Enrollment");
  const [expiresInHours, setExpiresInHours] = React.useState(24);
  const [showQr, setShowQr] = React.useState(false);
  const [countdown, setCountdown] = React.useState("23h 59m 45s");

  const handleGenerateQR = () => {
    setShowQr(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enrollment"
        description="Configure enrollment methods and onboard new devices"
      />

      {/* Method Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <MethodCard
          icon={QrCode}
          title="QR Code"
          description="Generate a QR code for quick device provisioning via Android Enterprise."
        />
        <MethodCard
          icon={Nfc}
          title="NFC"
          description="Tap-to-enroll using NFC for supported devices."
        />
        <MethodCard
          icon={Settings}
          title="Zero-Touch"
          description="Pre-configure devices for automatic enrollment when powered on."
        />
        <MethodCard
          icon={Smartphone}
          title="Samsung Knox"
          description="Knox Mobile Enrollment for Samsung devices."
        />
        <MethodCard
          icon={Link2}
          title="Manual"
          description="Manual enrollment via enrollment URL or email invitation."
        />
        <MethodCard
          icon={Smartphone}
          title="Apple DEP"
          description="Automatic enrollment via Apple Business Manager / Device Enrollment Program."
        />
      </div>

      {/* QR Code Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">QR Code Enrollment</CardTitle>
          <CardDescription>Generate a QR code to enroll new devices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Configuration Name</label>
              <Input
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="Enrollment config name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Expires In (hours)</label>
              <Input
                type="number"
                min={1}
                max={720}
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(Number(e.target.value))}
              />
            </div>
          </div>
          <Button onClick={handleGenerateQR}>
            Generate Enrollment QR
          </Button>

          {showQr && (
            <div className="mt-6 flex flex-col items-center gap-4 rounded-lg border p-6">
              <div className="h-48 w-48 bg-white border-2 rounded-lg flex items-center justify-center mx-auto">
                <div className="grid grid-cols-5 gap-1">
                  {[1,0,1,1,0,0,1,0,1,1,1,0,0,1,0,1,1,0,1,0,0,1,1,0,1].map((v, i) => (
                    <div key={i} className={`h-6 w-6 ${v ? 'bg-black' : 'bg-white'}`} />
                  ))}
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Enrollment URL</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">https://mdm.example.com/enroll?token=demo-token-abc123</p>
                <p className="mt-2 text-sm">
                  Expires in: <span className="font-mono font-medium">{countdown}</span>
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apple DEP Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apple DEP / Business Manager</CardTitle>
          <CardDescription>Configure Device Enrollment Program for automatic iOS enrollment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            <Smartphone className="mx-auto mb-2 h-8 w-8" />
            <p>DEP enrollment requires Apple Business Manager integration.</p>
            <p className="mt-1">
              Upload your DEP server token in{" "}
              <a href="/settings/apple" className="text-primary underline">
                Apple MDM Settings
              </a>{" "}
              to enable automatic enrollment.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Default DEP Profile</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select a DEP profile...</option>
                <option value="default">Default - Supervised, Skip Setup</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Assign to Group</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select a group...</option>
              </select>
            </div>
          </div>
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Save DEP Configuration
          </Button>
        </CardContent>
      </Card>

      {/* Zero-Touch Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zero-Touch Configuration</CardTitle>
          <CardDescription>Configure Google Zero-Touch portal settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Enterprise ID</label>
            <Input placeholder="Your Google enterprise ID" />
          </div>
          <div>
            <label className="text-sm font-medium">Service Account Email</label>
            <Input placeholder="service-account@project.iam.gserviceaccount.com" />
          </div>
          <div>
            <label className="text-sm font-medium">Default Policy</label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select a policy...</option>
            </select>
          </div>
          <Button variant="outline">Save Zero-Touch Config</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function MethodCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

