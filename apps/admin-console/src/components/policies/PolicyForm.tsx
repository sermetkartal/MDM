"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const defaultAndroidRestrictions: Record<string, boolean> = {
  // Hardware & Peripherals
  cameraDisabled: false, screenCaptureDisabled: false, usbFileTransferDisabled: false,
  usbDataSignalingDisabled: false, bluetoothDisabled: false, bluetoothSharingDisabled: false,
  nfcDisabled: false, outgoingBeamDisabled: false, mountPhysicalMediaDisabled: false,
  printingDisabled: false, ambientDisplayDisabled: false, microphoneToggleDisabled: false,
  // Network & Connectivity
  wifiConfigDisabled: false, wifiDirectDisabled: false, wifiTetheringDisabled: false,
  configVpnDisabled: false, configMobileNetworksDisabled: false, configPrivateDnsDisabled: false,
  configTetheringDisabled: false, dataRoamingDisabled: false,
  // Apps & Data
  installAppsDisabled: false, uninstallAppsDisabled: false, installUnknownSourcesDisabled: false,
  installUnknownSourcesGloballyDisabled: false, appsControlDisabled: false, autofillDisabled: false,
  crossProfileCopyPasteDisabled: false, shareIntoManagedProfileDisabled: false, createWindowsDisabled: false,
  // Security & Protection
  factoryResetDisabled: false, safeBootDisabled: false, debuggingDisabled: false,
  networkResetDisabled: false, locationSharingDisabled: false, contentCaptureDisabled: false,
  contentSuggestionsDisabled: false, statusBarDisabled: false, keyguardDisabled: false, autoTimeRequired: false,
  // User & Account
  outgoingCallsDisabled: false, smsDisabled: false, addUserDisabled: false, removeUserDisabled: false,
  userSwitchDisabled: false, modifyAccountsDisabled: false, addManagedProfileDisabled: false,
  removeManagedProfileDisabled: false, grantAdminDisabled: false,
  // Configuration & Settings
  adjustVolumeDisabled: false, configBrightnessDisabled: false, configDateTimeDisabled: false,
  configLocaleDisabled: false, configScreenTimeoutDisabled: false, configDefaultAppsDisabled: false,
  configCredentialsDisabled: false, configLocationDisabled: false, configCellBroadcastsDisabled: false,
};

const defaultiOSRestrictions: Record<string, boolean> = {
  // Media & Content
  allowInAppPurchases: true, allowExplicitContent: true, allowBookstore: true,
  allowBookstoreErotica: true, allowMultiplayerGaming: true, allowAddingGameCenterFriends: true,
  allowSiriWhileLocked: true, allowVoiceDialing: true,
  // Cloud & Sync
  forceEncryptedBackup: false, allowCloudDocumentSync: true, allowCloudKeychainSync: true,
  allowManagedAppsCloudSync: true,
  // Connectivity
  allowBluetoothModification: true, allowNFC: true, allowPersonalHotspot: true,
  allowUSBRestrictedMode: true, allowVPNCreation: true,
  // Device Control
  allowPasscodeModification: true, allowFingerprintModification: true, allowAutoUnlock: true,
  allowEraseContentAndSettings: true, forceAirPlayPairingPassword: false,
  allowNotificationsModification: true, allowDiagnosticSubmission: true,
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

function RestrictionToggle({ label, field, value, onChange }: { label: string; field: string; value: boolean; onChange: (field: string, value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-1">
      <span className="text-sm">{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(field, e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
    </label>
  );
}

interface RestrictionCategory {
  key: string;
  title: string;
  items: { label: string; field: string }[];
}

const androidCategories: RestrictionCategory[] = [
  {
    key: "hardware",
    title: "Hardware & Peripherals",
    items: [
      { label: "Camera", field: "cameraDisabled" },
      { label: "Screenshot", field: "screenCaptureDisabled" },
      { label: "USB File Transfer", field: "usbFileTransferDisabled" },
      { label: "USB Data Signaling", field: "usbDataSignalingDisabled" },
      { label: "Bluetooth", field: "bluetoothDisabled" },
      { label: "Bluetooth Sharing", field: "bluetoothSharingDisabled" },
      { label: "NFC/Beam", field: "nfcDisabled" },
      { label: "NFC Outgoing Beam", field: "outgoingBeamDisabled" },
      { label: "Mount Physical Media", field: "mountPhysicalMediaDisabled" },
      { label: "Printing", field: "printingDisabled" },
      { label: "Ambient Display", field: "ambientDisplayDisabled" },
      { label: "Microphone Toggle", field: "microphoneToggleDisabled" },
    ],
  },
  {
    key: "network",
    title: "Network & Connectivity",
    items: [
      { label: "WiFi Configuration", field: "wifiConfigDisabled" },
      { label: "WiFi Direct", field: "wifiDirectDisabled" },
      { label: "WiFi Tethering", field: "wifiTetheringDisabled" },
      { label: "VPN Configuration", field: "configVpnDisabled" },
      { label: "Mobile Networks Config", field: "configMobileNetworksDisabled" },
      { label: "Private DNS Config", field: "configPrivateDnsDisabled" },
      { label: "Tethering Config", field: "configTetheringDisabled" },
      { label: "Data Roaming", field: "dataRoamingDisabled" },
    ],
  },
  {
    key: "apps",
    title: "Apps & Data",
    items: [
      { label: "Install Apps", field: "installAppsDisabled" },
      { label: "Uninstall Apps", field: "uninstallAppsDisabled" },
      { label: "Install Unknown Sources", field: "installUnknownSourcesDisabled" },
      { label: "Unknown Sources Globally", field: "installUnknownSourcesGloballyDisabled" },
      { label: "Apps Control Panel", field: "appsControlDisabled" },
      { label: "Autofill", field: "autofillDisabled" },
      { label: "Clipboard/Cross-Profile Copy", field: "crossProfileCopyPasteDisabled" },
      { label: "Share Into Managed Profile", field: "shareIntoManagedProfileDisabled" },
      { label: "Create Windows/Overlays", field: "createWindowsDisabled" },
    ],
  },
  {
    key: "security",
    title: "Security & Protection",
    items: [
      { label: "Factory Reset", field: "factoryResetDisabled" },
      { label: "Safe Boot", field: "safeBootDisabled" },
      { label: "Developer Options/Debugging", field: "debuggingDisabled" },
      { label: "Network Reset", field: "networkResetDisabled" },
      { label: "Location Sharing", field: "locationSharingDisabled" },
      { label: "Content Capture", field: "contentCaptureDisabled" },
      { label: "Content Suggestions", field: "contentSuggestionsDisabled" },
      { label: "Status Bar", field: "statusBarDisabled" },
      { label: "Keyguard/Lock Screen", field: "keyguardDisabled" },
      { label: "Auto Time Required", field: "autoTimeRequired" },
    ],
  },
  {
    key: "user",
    title: "User & Account",
    items: [
      { label: "Outgoing Calls", field: "outgoingCallsDisabled" },
      { label: "SMS", field: "smsDisabled" },
      { label: "Add User", field: "addUserDisabled" },
      { label: "Remove User", field: "removeUserDisabled" },
      { label: "User Switch", field: "userSwitchDisabled" },
      { label: "Modify Accounts", field: "modifyAccountsDisabled" },
      { label: "Add Managed Profile", field: "addManagedProfileDisabled" },
      { label: "Remove Managed Profile", field: "removeManagedProfileDisabled" },
      { label: "Grant Admin", field: "grantAdminDisabled" },
    ],
  },
  {
    key: "config",
    title: "Configuration & Settings",
    items: [
      { label: "Volume Adjustment", field: "adjustVolumeDisabled" },
      { label: "Brightness Config", field: "configBrightnessDisabled" },
      { label: "Date/Time Config", field: "configDateTimeDisabled" },
      { label: "Locale Config", field: "configLocaleDisabled" },
      { label: "Screen Timeout Config", field: "configScreenTimeoutDisabled" },
      { label: "Default Apps Config", field: "configDefaultAppsDisabled" },
      { label: "Credentials Config", field: "configCredentialsDisabled" },
      { label: "Location Config", field: "configLocationDisabled" },
      { label: "Cell Broadcasts Config", field: "configCellBroadcastsDisabled" },
    ],
  },
];

const iosCategories: RestrictionCategory[] = [
  {
    key: "media",
    title: "Media & Content",
    items: [
      { label: "In-App Purchases", field: "allowInAppPurchases" },
      { label: "Explicit Content", field: "allowExplicitContent" },
      { label: "Bookstore", field: "allowBookstore" },
      { label: "Bookstore Erotica", field: "allowBookstoreErotica" },
      { label: "Multiplayer Gaming", field: "allowMultiplayerGaming" },
      { label: "Game Center Friends", field: "allowAddingGameCenterFriends" },
      { label: "Siri While Locked", field: "allowSiriWhileLocked" },
      { label: "Voice Dialing", field: "allowVoiceDialing" },
    ],
  },
  {
    key: "cloud",
    title: "Cloud & Sync",
    items: [
      { label: "Force Encrypted Backup", field: "forceEncryptedBackup" },
      { label: "Cloud Document Sync", field: "allowCloudDocumentSync" },
      { label: "Cloud Keychain Sync", field: "allowCloudKeychainSync" },
      { label: "Managed Apps Cloud Sync", field: "allowManagedAppsCloudSync" },
    ],
  },
  {
    key: "connectivity",
    title: "Connectivity",
    items: [
      { label: "Bluetooth Modification", field: "allowBluetoothModification" },
      { label: "NFC", field: "allowNFC" },
      { label: "Personal Hotspot", field: "allowPersonalHotspot" },
      { label: "USB Restricted Mode", field: "allowUSBRestrictedMode" },
      { label: "VPN Creation", field: "allowVPNCreation" },
    ],
  },
  {
    key: "deviceControl",
    title: "Device Control",
    items: [
      { label: "Passcode Modification", field: "allowPasscodeModification" },
      { label: "Fingerprint/Face ID Modification", field: "allowFingerprintModification" },
      { label: "Auto Unlock", field: "allowAutoUnlock" },
      { label: "Erase Content & Settings", field: "allowEraseContentAndSettings" },
      { label: "Force AirPlay Pairing Password", field: "forceAirPlayPairingPassword" },
      { label: "Notification Modification", field: "allowNotificationsModification" },
      { label: "Diagnostic Submission", field: "allowDiagnosticSubmission" },
    ],
  },
];

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
      case "restriction": setPayload({ type: "restriction", ...defaultAndroidRestrictions, ...defaultiOSRestrictions }); break;
      case "passcode": setPayload({ type: "passcode", ...defaultPasscode }); break;
      case "wifi": setPayload({ type: "wifi", ...defaultWifi }); break;
      case "kiosk": setPayload({ type: "kiosk", ...defaultKiosk }); break;
      case "vpn": setPayload({ type: "vpn", protocol: "ikev2", server: "", username: "" }); break;
    }
  }, [policyType]);

  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRestrictionChange = (field: string, value: boolean) => {
    setPayload((prev) => ({ ...prev, [field]: value }));
  };

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
              {platform === "android" && (
                <div className="space-y-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Android Restrictions</p>
                  {androidCategories.map((cat) => (
                    <div key={cat.key} className="space-y-2">
                      <h4
                        className="font-medium text-sm cursor-pointer select-none flex items-center gap-1 hover:text-primary"
                        onClick={() => toggleSection(cat.key)}
                      >
                        <span className="text-xs">{openSections[cat.key] ? "\u25BC" : "\u25B6"}</span>
                        {cat.title}
                        <span className="text-xs text-muted-foreground ml-1">({cat.items.length})</span>
                      </h4>
                      {openSections[cat.key] && (
                        <div className="space-y-1 pl-4 border-l-2 border-muted">
                          {cat.items.map((item) => (
                            <RestrictionToggle
                              key={item.field}
                              label={item.label}
                              field={item.field}
                              value={!!payload[item.field]}
                              onChange={handleRestrictionChange}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {platform === "ios" && (
                <div className="space-y-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">iOS Restrictions</p>
                  {iosCategories.map((cat) => (
                    <div key={cat.key} className="space-y-2">
                      <h4
                        className="font-medium text-sm cursor-pointer select-none flex items-center gap-1 hover:text-primary"
                        onClick={() => toggleSection(cat.key)}
                      >
                        <span className="text-xs">{openSections[cat.key] ? "\u25BC" : "\u25B6"}</span>
                        {cat.title}
                        <span className="text-xs text-muted-foreground ml-1">({cat.items.length})</span>
                      </h4>
                      {openSections[cat.key] && (
                        <div className="space-y-1 pl-4 border-l-2 border-muted">
                          {cat.items.map((item) => (
                            <RestrictionToggle
                              key={item.field}
                              label={item.label}
                              field={item.field}
                              value={!!payload[item.field]}
                              onChange={handleRestrictionChange}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {platform !== "android" && platform !== "ios" && (
                <p className="text-sm text-muted-foreground">Restriction policies are available for Android and iOS platforms.</p>
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
