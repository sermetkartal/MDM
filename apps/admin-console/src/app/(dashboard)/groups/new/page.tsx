"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DynamicRuleBuilder } from "@/components/groups/DynamicRuleBuilder";
import { useCreateGroup, useGroupTree, usePreviewRules } from "@/hooks/queries/use-groups";
import type { RuleGroup, GroupTreeNode, CreateGroupRequest } from "@/lib/types";

function flattenTree(nodes: GroupTreeNode[], depth = 0): { id: string; name: string; depth: number }[] {
  const result: { id: string; name: string; depth: number }[] = [];
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth });
    if (node.children) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

export default function NewGroupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultParentId = searchParams.get("parentId") || "";

  const createGroup = useCreateGroup();
  const { data: treeData } = useGroupTree();
  const previewRules = usePreviewRules();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<"static" | "dynamic">("static");
  const [parentId, setParentId] = React.useState(defaultParentId);
  const [rules, setRules] = React.useState<RuleGroup>({ operator: "and", conditions: [] });

  const flatGroups = flattenTree(treeData?.data ?? []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateGroupRequest = {
      name,
      description: description || undefined,
      type,
      parentId: parentId || null,
    };

    if (type === "dynamic" && rules.conditions.length > 0) {
      data.rules = rules;
    }

    createGroup.mutate(data, {
      onSuccess: (group) => {
        router.push(`/groups/${group.id}`);
      },
    });
  };

  const handlePreview = () => {
    if (rules.conditions.length > 0) {
      previewRules.mutate(rules);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/groups")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title="Create Group"
          description="Create a new device group"
        />
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Group Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="Group name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  placeholder="Optional description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={type === "static" ? "default" : "outline"}
                    onClick={() => setType("static")}
                    className="flex-1"
                  >
                    Static
                  </Button>
                  <Button
                    type="button"
                    variant={type === "dynamic" ? "default" : "outline"}
                    onClick={() => setType("dynamic")}
                    className="flex-1"
                  >
                    Dynamic
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {type === "static"
                    ? "Manually add and remove devices from this group."
                    : "Devices are automatically added based on matching rules."}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Parent Group (optional)</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                >
                  <option value="">None (root level)</option>
                  {flatGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {"  ".repeat(g.depth)}{g.name}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {type === "dynamic" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dynamic Rules</CardTitle>
              </CardHeader>
              <CardContent>
                <DynamicRuleBuilder
                  value={rules}
                  onChange={setRules}
                  previewCount={previewRules.data?.count ?? null}
                  onPreview={handlePreview}
                  previewLoading={previewRules.isPending}
                />
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/groups")}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name || createGroup.isPending}
            >
              {createGroup.isPending ? "Creating..." : "Create Group"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
