"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Users,
  Zap,
  Shield,
  FolderTree,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/common/DataTable";
import { DynamicRuleBuilder } from "@/components/groups/DynamicRuleBuilder";
import {
  useGroup,
  useGroupMembers,
  useGroupPolicies,
  useUpdateGroup,
  useEvaluateGroup,
  useRemoveDeviceFromGroup,
  usePreviewRules,
} from "@/hooks/queries/use-groups";
import type { RuleGroup, GroupMember } from "@/lib/types";

interface MemberRow extends Record<string, unknown> {
  id: string;
  name: string | null;
  platform: string;
  os_version: string | null;
  model: string | null;
  status: string;
  compliance_status: string;
}

const memberColumns: Column<MemberRow>[] = [
  {
    key: "name",
    header: "Device",
    sortable: true,
    render: (row) => <span className="font-medium">{row.name || "Unnamed"}</span>,
  },
  { key: "platform", header: "Platform", sortable: true },
  { key: "os_version", header: "OS Version" },
  { key: "model", header: "Model" },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge variant={row.status === "enrolled" ? "default" : "secondary"}>
        {String(row.status)}
      </Badge>
    ),
  },
  {
    key: "compliance_status",
    header: "Compliance",
    render: (row) => (
      <Badge
        variant={
          row.compliance_status === "compliant"
            ? "default"
            : row.compliance_status === "non_compliant"
              ? "destructive"
              : "secondary"
        }
      >
        {String(row.compliance_status)}
      </Badge>
    ),
  },
];

export default function GroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = params.groupId as string;
  const defaultTab = searchParams.get("tab") || "members";

  const { data: group, isLoading: groupLoading } = useGroup(groupId);
  const { data: membersData } = useGroupMembers(groupId);
  const { data: policiesData } = useGroupPolicies(groupId);
  const updateGroup = useUpdateGroup(groupId);
  const evaluateGroup = useEvaluateGroup(groupId);
  const removeDevice = useRemoveDeviceFromGroup(groupId);
  const previewRules = usePreviewRules();

  const [rules, setRules] = React.useState<RuleGroup>({ operator: "and", conditions: [] });
  const [rulesInitialized, setRulesInitialized] = React.useState(false);

  React.useEffect(() => {
    if (group?.rules && !rulesInitialized) {
      setRules(group.rules);
      setRulesInitialized(true);
    }
  }, [group, rulesInitialized]);

  const handleSaveRules = () => {
    updateGroup.mutate({ rules });
  };

  const handleReEvaluate = () => {
    evaluateGroup.mutate();
  };

  const handlePreview = () => {
    if (rules.conditions.length > 0) {
      previewRules.mutate(rules);
    }
  };

  const handleRemoveDevice = (deviceId: string) => {
    if (confirm("Remove this device from the group?")) {
      removeDevice.mutate(deviceId);
    }
  };

  if (groupLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-muted/50 rounded animate-pulse" />
        <div className="h-64 bg-muted/50 rounded animate-pulse" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Group not found
      </div>
    );
  }

  const members = (membersData?.data ?? []) as unknown as MemberRow[];
  const directPolicies = policiesData?.data ?? [];
  const inheritedPolicies = policiesData?.inherited ?? [];

  const memberColumnsWithActions: Column<MemberRow>[] = [
    ...memberColumns,
    ...(group.type !== "dynamic"
      ? [
          {
            key: "_actions" as const,
            header: "",
            render: (row: MemberRow) => (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  handleRemoveDevice(row.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/groups")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={group.name}
          description={group.description || undefined}
          actions={
            <div className="flex gap-2">
              {group.type === "dynamic" && (
                <Button
                  variant="outline"
                  onClick={handleReEvaluate}
                  disabled={evaluateGroup.isPending}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {evaluateGroup.isPending ? "Evaluating..." : "Re-evaluate"}
                </Button>
              )}
              <Badge variant="outline" className="text-sm px-3 py-1">
                {group.memberCount ?? 0} devices
              </Badge>
              <Badge
                variant={group.type === "dynamic" ? "secondary" : "outline"}
                className="text-sm px-3 py-1"
              >
                {group.type}
              </Badge>
            </div>
          }
        />
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="members">
            <Users className="mr-1.5 h-3.5 w-3.5" />
            Members
          </TabsTrigger>
          {group.type === "dynamic" && (
            <TabsTrigger value="rules">
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              Rules
            </TabsTrigger>
          )}
          <TabsTrigger value="policies">
            <Shield className="mr-1.5 h-3.5 w-3.5" />
            Policies
          </TabsTrigger>
          <TabsTrigger value="subgroups">
            <FolderTree className="mr-1.5 h-3.5 w-3.5" />
            Sub-groups
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Group Members</CardTitle>
              {group.type !== "dynamic" && (
                <Button size="sm" onClick={() => router.push(`/groups/${groupId}?tab=members&add=true`)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Devices
                </Button>
              )}
              {group.type === "dynamic" && (
                <Badge variant="secondary">
                  Matched: {group.memberCount ?? 0} devices
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              <DataTable
                columns={memberColumnsWithActions}
                data={members}
                searchKey="name"
                searchPlaceholder="Search devices..."
                onRowClick={(row) => router.push(`/devices/${row.id}`)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {group.type === "dynamic" && (
          <TabsContent value="rules" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dynamic Rules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DynamicRuleBuilder
                  value={rules}
                  onChange={setRules}
                  previewCount={previewRules.data?.count ?? null}
                  onPreview={handlePreview}
                  previewLoading={previewRules.isPending}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveRules}
                    disabled={updateGroup.isPending}
                  >
                    {updateGroup.isPending ? "Saving..." : "Save Rules"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="policies" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Assigned Policies</CardTitle>
              <Button size="sm" onClick={() => alert("Assign policy (demo mode)")}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Assign Policy
              </Button>
            </CardHeader>
            <CardContent>
              {directPolicies.length === 0 && inheritedPolicies.length === 0 ? (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  No policies assigned to this group
                </div>
              ) : (
                <div className="space-y-4">
                  {directPolicies.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Direct Policies</h4>
                      <div className="space-y-2">
                        {directPolicies.map((p: any) => (
                          <div key={p.assignmentId} className="flex items-center justify-between rounded-lg border p-3">
                            <div>
                              <div className="font-medium text-sm">{p.policyName}</div>
                              <div className="text-xs text-muted-foreground">
                                {p.platform} - v{p.version}
                              </div>
                            </div>
                            <Badge variant="outline">{p.platform}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {inheritedPolicies.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Inherited from Parent</h4>
                      <div className="space-y-2">
                        {inheritedPolicies.map((p: any) => (
                          <div key={p.assignmentId} className="flex items-center justify-between rounded-lg border border-dashed p-3">
                            <div>
                              <div className="font-medium text-sm">{p.policyName}</div>
                              <div className="text-xs text-muted-foreground">
                                {p.platform} - v{p.version} (inherited)
                              </div>
                            </div>
                            <Badge variant="secondary">Inherited</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subgroups" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Sub-groups</CardTitle>
              <Button size="sm" onClick={() => router.push(`/groups/new?parentId=${groupId}`)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Create Sub-group
              </Button>
            </CardHeader>
            <CardContent>
              {(!group.children || group.children.length === 0) ? (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  No sub-groups
                </div>
              ) : (
                <div className="space-y-2">
                  {group.children.map((child) => (
                    <div
                      key={child.id}
                      className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/groups/${child.id}`)}
                    >
                      <div className="flex items-center gap-2">
                        <FolderTree className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{child.name}</span>
                      </div>
                      <Badge variant="outline">{child.type}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
