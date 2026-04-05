"use client";

import { useState } from "react";
import { Download, Upload, CheckCircle, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SamlFormData {
  entityId: string;
  ssoLoginUrl: string;
  ssoLogoutUrl: string;
  certificate: string;
  emailAttribute: string;
  firstNameAttribute: string;
  lastNameAttribute: string;
}

interface OidcFormData {
  provider: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
}

export default function SsoPage() {
  const [saml, setSaml] = useState<SamlFormData>({
    entityId: "",
    ssoLoginUrl: "",
    ssoLogoutUrl: "",
    certificate: "",
    emailAttribute: "email",
    firstNameAttribute: "firstName",
    lastNameAttribute: "lastName",
  });

  const [oidc, setOidc] = useState<OidcFormData>({
    provider: "custom",
    issuerUrl: "",
    clientId: "",
    clientSecret: "",
  });

  const [samlStatus, setSamlStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [oidcStatus, setOidcStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function handleSaveSaml() {
    setSamlStatus("saving");
    setTimeout(() => {
      setSamlStatus("saved");
    }, 500);
  }

  function handleSaveOidc() {
    setOidcStatus("saving");
    setTimeout(() => {
      setOidcStatus("saved");
    }, 500);
  }

  function downloadSpMetadata() {
    const demoXml = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://mdm.example.com/saml/metadata">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://mdm.example.com/api/v1/auth/saml/callback" />
  </SPSSODescriptor>
</EntityDescriptor>`;
    const blob = new Blob([demoXml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sp-metadata.xml";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleIdpMetadataUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const entityIdMatch = text.match(/entityID="([^"]+)"/);
      const ssoMatch = text.match(/Location="([^"]+)"[^>]*Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"/);
      const certMatch = text.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/);

      setSaml((prev) => ({
        ...prev,
        entityId: entityIdMatch?.[1] ?? prev.entityId,
        ssoLoginUrl: ssoMatch?.[1] ?? prev.ssoLoginUrl,
        certificate: certMatch?.[1]?.replace(/\s/g, "") ?? prev.certificate,
      }));
      alert("IdP metadata imported (demo mode)");
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Single Sign-On"
        description="Configure SAML 2.0 or OIDC identity provider integration"
      />

      <Tabs defaultValue="saml">
        <TabsList>
          <TabsTrigger value="saml">SAML 2.0</TabsTrigger>
          <TabsTrigger value="oidc">OIDC</TabsTrigger>
        </TabsList>

        <TabsContent value="saml">
          <div className="space-y-4">
            {/* SP Metadata */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Service Provider Metadata</CardTitle>
                <CardDescription>
                  Download SP metadata to configure your Identity Provider
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={downloadSpMetadata}>
                  <Download className="mr-2 h-4 w-4" />
                  Download SP Metadata XML
                </Button>
              </CardContent>
            </Card>

            {/* IdP Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Identity Provider Configuration</CardTitle>
                <CardDescription>
                  Upload IdP metadata XML or manually enter the configuration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Upload IdP Metadata XML</label>
                  <div className="mt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Button variant="outline" size="sm" asChild>
                        <span>
                          <Upload className="mr-2 h-4 w-4" />
                          Upload XML
                        </span>
                      </Button>
                      <input
                        type="file"
                        accept=".xml"
                        className="hidden"
                        onChange={handleIdpMetadataUpload}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">IdP Entity ID</label>
                  <Input
                    value={saml.entityId}
                    onChange={(e) => setSaml((p) => ({ ...p, entityId: e.target.value }))}
                    placeholder="https://idp.example.com/metadata"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">SSO Login URL</label>
                  <Input
                    value={saml.ssoLoginUrl}
                    onChange={(e) => setSaml((p) => ({ ...p, ssoLoginUrl: e.target.value }))}
                    placeholder="https://idp.example.com/sso/saml"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">SSO Logout URL (optional)</label>
                  <Input
                    value={saml.ssoLogoutUrl}
                    onChange={(e) => setSaml((p) => ({ ...p, ssoLogoutUrl: e.target.value }))}
                    placeholder="https://idp.example.com/sso/logout"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">IdP Signing Certificate (Base64)</label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[80px]"
                    value={saml.certificate}
                    onChange={(e) => setSaml((p) => ({ ...p, certificate: e.target.value }))}
                    placeholder="MIIDdDCCA..."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Attribute Mapping */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Attribute Mapping</CardTitle>
                <CardDescription>
                  Map SAML assertion attributes to user fields
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Email Attribute</label>
                    <Input
                      value={saml.emailAttribute}
                      onChange={(e) => setSaml((p) => ({ ...p, emailAttribute: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">First Name Attribute</label>
                    <Input
                      value={saml.firstNameAttribute}
                      onChange={(e) => setSaml((p) => ({ ...p, firstNameAttribute: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Last Name Attribute</label>
                    <Input
                      value={saml.lastNameAttribute}
                      onChange={(e) => setSaml((p) => ({ ...p, lastNameAttribute: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Button onClick={handleSaveSaml} disabled={samlStatus === "saving"}>
                {samlStatus === "saving" ? "Saving..." : "Save SAML Configuration"}
              </Button>
              {samlStatus === "saved" && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" /> Saved (demo mode)
                </span>
              )}
              {samlStatus === "error" && (
                <span className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> Failed to save
                </span>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="oidc">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">OIDC Provider Configuration</CardTitle>
                <CardDescription>
                  Configure OpenID Connect authentication
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Provider</label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={oidc.provider}
                    onChange={(e) => setOidc((p) => ({ ...p, provider: e.target.value }))}
                  >
                    <option value="okta">Okta</option>
                    <option value="azure_ad">Azure AD</option>
                    <option value="google">Google Workspace</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Issuer URL</label>
                  <Input
                    value={oidc.issuerUrl}
                    onChange={(e) => setOidc((p) => ({ ...p, issuerUrl: e.target.value }))}
                    placeholder={
                      oidc.provider === "okta"
                        ? "https://your-org.okta.com"
                        : oidc.provider === "azure_ad"
                        ? "https://login.microsoftonline.com/{tenant}/v2.0"
                        : oidc.provider === "google"
                        ? "https://accounts.google.com"
                        : "https://idp.example.com"
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Client ID</label>
                  <Input
                    value={oidc.clientId}
                    onChange={(e) => setOidc((p) => ({ ...p, clientId: e.target.value }))}
                    placeholder="Your OIDC client ID"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Client Secret</label>
                  <Input
                    type="password"
                    value={oidc.clientSecret}
                    onChange={(e) => setOidc((p) => ({ ...p, clientSecret: e.target.value }))}
                    placeholder="Your OIDC client secret"
                  />
                </div>

                <div className="rounded-md bg-muted p-3 text-sm">
                  <p className="font-medium mb-1">Redirect URI</p>
                  <code className="text-xs bg-background rounded px-2 py-1">
                    {typeof window !== "undefined" ? window.location.origin : "http://localhost:3001"}/api/v1/auth/oidc/callback
                  </code>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Add this URL to your OIDC provider's allowed redirect URIs.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Button onClick={handleSaveOidc} disabled={oidcStatus === "saving"}>
                {oidcStatus === "saving" ? "Saving..." : "Save OIDC Configuration"}
              </Button>
              {oidcStatus === "saved" && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" /> Saved (demo mode)
                </span>
              )}
              {oidcStatus === "error" && (
                <span className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> Failed to save
                </span>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
