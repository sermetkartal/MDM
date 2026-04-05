"use client";

import { Building2, Users, Shield, Bell, Key, Globe, FolderSync } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

const settingsSections = [
  {
    icon: Building2,
    title: "Organization",
    description: "Manage organization name, branding, and general settings",
    href: "/settings",
  },
  {
    icon: Shield,
    title: "Roles & Permissions",
    description: "Manage RBAC roles and permission assignments",
    href: "/settings/roles",
  },
  {
    icon: Users,
    title: "Users",
    description: "Manage admin users, invite new users, and assign roles",
    href: "/settings/users",
  },
  {
    icon: Globe,
    title: "Single Sign-On",
    description: "Configure SSO with SAML 2.0 or OIDC (Okta, Azure AD, Google)",
    href: "/settings/sso",
  },
  {
    icon: Key,
    title: "Integrations & SCIM",
    description: "SCIM provisioning, API keys, and external integrations",
    href: "/settings/integrations",
  },
  {
    icon: FolderSync,
    title: "LDAP / Active Directory",
    description: "Sync users and groups from LDAP or Active Directory",
    href: "/settings/ldap",
  },
  {
    icon: Bell,
    title: "Notifications",
    description: "Configure alert channels: email, Slack, webhooks",
    href: "/settings",
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your organization settings" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {settingsSections.map((section) => (
          <Link key={section.title} href={section.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <section.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">{section.title}</CardTitle>
                </div>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
