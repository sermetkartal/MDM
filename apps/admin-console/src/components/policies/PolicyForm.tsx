"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Platform } from "@/lib/types";

type PolicyType = "restriction" | "wifi" | "vpn" | "passcode" | "kiosk";

export interface PolicyFormData {
  name: string;
  description: string;
  platform: Platform;
  policyType: PolicyType;
  payload: Record<string, unknown>;
  isActive: boolean;
}

interface PolicyFormProps {
  initialData?: Partial<PolicyFormData>;
  onSubmit: (data: PolicyFormData) => void;
  isPending?: boolean;
  submitLabel?: string;
}

const defaultRestrictions = {
  camera: true, screenshot: true, usb: true, bluetooth: true,
  wifiConfig: true, factoryReset: true, appInstall: true,
  developerOptions: false, safeMode: true, clipboard: true, volume: true,
};

const defaultPasscode = {
  minLength: 6, quality: "numeric", maxFailedAttempts: 10,
  expirationDays: 90, historyLength: 5,
};

const defaultWifi = {
  ssid: "", securityType: "WPA2", password: "", autoConnect: true,
};

const defaultKiosk = {
  mode: "single_app", allowedApps: [], primaryApp: "", exitPin: "", showStatusBar: false, showNavBar: false,
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between py-1">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
        onClick={() => onChange(!checked)}
      >
        <span className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </label>
  );
}

export function PolicyForm({ initialData, onSubmit, isPending, submitLabel = "Save Policy" }: PolicyFormProps) {
  const [name, setName] = React.useState(initialData?.name ?? "");
  const [description, setDescription] = React.useState(initialData?.description ?? "");
  const [platform, setPlatform] = React.useState<Platform>(initialData?.platform ?? "android");
  const [policyType, setPolicyType] = React.useState<PolicyType>(initialData?.policyType ?? "restriction");
  const [isActive, setIsActive] = React.useState(initialData?.isActive ?? true);
  const [payload, setPayload] = React.useState<Record<string, unknown>>(initialData?.payload ?? {});

  // Reset payload when type changes
  React.useEffect(() => {
    if (initialData?.policyType === policyType && initialData?.payload) return;
    switch (policyType) {
      case "restriction": setPayload({ type: "restriction", ...defaultRestrictions }); break;
      case "passcode": setPayload({ type: "passcode", ...defaultPasscode }); break;
      case "wifi": setPayload({ type: "wifi", ...defaultWifi }); break;
      case "kiosk": setPayload({ type: "kiosk", ...defaultKiosk }); break;
      case "vpn": setPayload({ type: "vpn", protocol: "ikev2", server: "", username: "" }); break;
    }
  }, [policyType]);

  const updatePayload = (key: string, value: unknown) => {
    setPayload((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, description, platform, policyType, payload, isActive });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Policy Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Policy name" required />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Platform</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
                <option value="android">Android</option>
                <option value="ios">iOS</option>
                <option value="windows">Windows</option>
                <option value="macos">macOS</option>
                <option value="linux">Linux</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Type</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={policyType} onChange={(e) => setPolicyType(e.target.value as PolicyType)}>
                <option value="restriction">Restriction</option>
                <option value="passcode">Passcode</option>
                <option value="wifi">WiFi</option>
                <option value="vpn">VPN</option>
                <option value="kiosk">Kiosk</option>
              </select>
            </div>
          </div>
          <Toggle checked={isActive} onChange={setIsActive} label="Active" />
        </CardContent>
      </Card>

      {/* Dynamic Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {policyType === "restriction" && (
            <>
              <Toggle checked={!!payload.camera} onChange={(v) => updatePayload("camera", v)} label="Allow Camera" />
              <Toggle checked={!!payload.screenshot} onChange={(v) => updatePayload("screenshot", v)} label="Allow Screenshot" />
              <Toggle checked={!!payload.usb} onChange={(v) => updatePayload("usb", v)} label="Allow USB" />
              <Toggle checked={!!payload.bluetooth} onChange={(v) => updatePayload("bluetooth", v)} label="Allow Bluetooth" />
              <Toggle checked={!!payload.wifiConfig} onChange={(v) => updatePayload("wifiConfig", v)} label="Allow WiFi Configuration" />
              <Toggle checked={!!payload.factoryReset} onChange={(v) => updatePayload("factoryReset", v)} label="Allow Factory Reset" />
              <Toggle checked={!!payload.appInstall} onChange={(v) => updatePayload("appInstall", v)} label="Allow App Install" />
              <Toggle checked={!!payload.developerOptions} onChange={(v) => updatePayload("developerOptions", v)} label="Allow Developer Options" />
              <Toggle checked={!!payload.safeMode} onChange={(v) => updatePayload("safeMode", v)} label="Allow Safe Mode" />
              <Toggle checked={!!payload.clipboard} onChange={(v) => updatePayload("clipboard", v)} label="Allow Clipboard" />
              <Toggle checked={!!payload.volume} onChange={(v) => updatePayload("volume", v)} label="Allow Volume Control" />
              {platform === "ios" && (
                <>
                  <Separator />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">iOS-Specific Restrictions</p>
                  <Toggle checked={payload.allowSiri !== false} onChange={(v) => updatePayload("allowSiri", v)} label="Allow Siri" />
                  <Toggle checked={payload.allowAirDrop !== false} onChange={(v) => updatePayload("allowAirDrop", v)} label="Allow AirDrop" />
                  <Toggle checked={payload.allowSafari !== false} onChange={(v) => updatePayload("allowSafari", v)} label="Allow Safari" />
                  <Toggle checked={payload.allowFaceTime !== false} onChange={(v) => updatePayload("allowFaceTime", v)} label="Allow FaceTime" />
                  <Toggle checked={payload.allowiCloud !== false} onChange={(v) => updatePayload("allowiCloud", v)} label="Allow iCloud Backup" />
                  <Toggle checked={payload.allowGameCenter !== false} onChange={(v) => updatePayload("allowGameCenter", v)} label="Allow Game Center" />
                  <Toggle checked={payload.allowPassbook !== false} onChange={(v) => updatePayload("allowPassbook", v)} label="Allow Passbook in Lock Screen" />
                  <Toggle checked={payload.allowITunes !== false} onChange={(v) => updatePayload("allowITunes", v)} label="Allow iTunes Store" />
                  <Toggle checked={payload.allowInAppPurchases !== false} onChange={(v) => updatePayload("allowInAppPurchases", v)} label="Allow In-App Purchases" />
                </>
              )}
            </>
          )}

          {policyType === "passcode" && (
            <>
              <div>
                <label className="text-sm font-medium">Minimum Length</label>
                <Input type="number" min={4} max={16} value={String(payload.minLength ?? 6)} onChange={(e) => updatePayload("minLength", Number(e.target.value))} />
              </div>
              <div>
                <label className="text-sm font-medium">Quality</label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={String(payload.quality ?? "numeric")} onChange={(e) => updatePayload("quality", e.target.value)}>
                  <option value="numeric">Numeric</option>
                  <option value="alphanumeric">Alphanumeric</option>
                  <option value="complex">Complex</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Max Failed Attempts</label>
                <Input type="number" min={1} max={30} value={String(payload.maxFailedAttempts ?? 10)} onChange={(e) => updatePayload("maxFailedAttempts", Number(e.target.value))} />
              </div>
              <div>
                <label className="text-sm font-medium">Expiration (days)</label>
                <Input type="number" min={0} value={String(payload.expirationDays ?? 90)} onChange={(e) => updatePayload("expirationDays", Number(e.target.value))} />
              </div>
              <div>
                <label className="text-sm font-medium">History Length</label>
                <Input type="number" min={0} max={24} value={String(payload.historyLength ?? 5)} onChange={(e) => updatePayload("historyLength", Number(e.target.value))} />
              </div>
            </>
          )}

          {policyType === "wifi" && (
            <>
              <div>
                <label className="text-sm font-medium">SSID</label>
                <Input value={String(payload.ssid ?? "")} onChange={(e) => updatePayload("ssid", e.target.value)} placeholder="Network name" />
              </div>
              <div>
                <label className="text-sm font-medium">Security Type</label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={String(payload.securityType ?? "WPA2")} onChange={(e) => updatePayload("securityType", e.target.value)}>
                  <option value="WPA2">WPA2</option>
                  <option value="WPA3">WPA3</option>
                  <option value="Enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Password</label>
                <Input type="password" value={String(payload.password ?? "")} onChange={(e) => updatePayload("password", e.target.value)} />
              </div>
              <Toggle checked={!!payload.autoConnect} onChange={(v) => updatePayload("autoConnect", v)} label="Auto Connect" />
            </>
          )}

          {policyType === "kiosk" && (
            <>
              <div>
                <label className="text-sm font-medium">Mode</label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={String(payload.mode ?? "single_app")} onChange={(e) => updatePayload("mode", e.target.value)}>
                  <option value="single_app">Single App</option>
                  <option value="multi_app">Multi App</option>
                  <option value="web_kiosk">Web Kiosk</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Primary App (package name)</label>
                <Input value={String(payload.primaryApp ?? "")} onChange={(e) => updatePayload("primaryApp", e.target.value)} placeholder="com.example.app" />
              </div>
              <div>
                <label className="text-sm font-medium">Exit PIN</label>
                <Input type="password" value={String(payload.exitPin ?? "")} onChange={(e) => updatePayload("exitPin", e.target.value)} placeholder="PIN to exit kiosk mode" />
              </div>
              <Toggle checked={!!payload.showStatusBar} onChange={(v) => updatePayload("showStatusBar", v)} label="Show Status Bar" />
              <Toggle checked={!!payload.showNavBar} onChange={(v) => updatePayload("showNavBar", v)} label="Show Navigation Bar" />
            </>
          )}

          {policyType === "vpn" && (
            <>
              <div>
                <label className="text-sm font-medium">Protocol</label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={String(payload.protocol ?? "ikev2")} onChange={(e) => updatePayload("protocol", e.target.value)}>
                  <option value="ikev2">IKEv2</option>
                  <option value="openvpn">OpenVPN</option>
                  <option value="wireguard">WireGuard</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Server</label>
                <Input value={String(payload.server ?? "")} onChange={(e) => updatePayload("server", e.target.value)} placeholder="vpn.example.com" />
              </div>
              <div>
                <label className="text-sm font-medium">Username</label>
                <Input value={String(payload.username ?? "")} onChange={(e) => updatePayload("username", e.target.value)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={isPending || !name.trim()}>
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
