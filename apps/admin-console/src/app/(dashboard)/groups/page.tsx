"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, MoreVertical, Pencil, Trash2, RefreshCw, Users, Zap, FolderTree, Globe } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GroupTree } from "@/components/groups/GroupTree";
import type { GroupTreeNode } from "@/lib/types";

export default function GroupsPage() {
  const router = useRouter();

  const tree: GroupTreeNode[] = [
    { id: "g1", name: "All Devices", description: null, type: "static", memberCount: 45, parentId: null, depth: 0, children: [
      { id: "g2", name: "Warehouse", description: null, type: "static", memberCount: 20, parentId: "g1", depth: 1, children: [] },
      { id: "g3", name: "Retail POS", description: null, type: "dynamic", memberCount: 15, parentId: "g1", depth: 1, children: [] },
      { id: "g4", name: "Field Workers", description: null, type: "static", memberCount: 10, parentId: "g1", depth: 1, children: [] },
    ]},
  ];
  const isLoading = false;

  const [selectedGroup, setSelectedGroup] = React.useState<GroupTreeNode | null>(null);

  const handleSelect = (node: GroupTreeNode) => {
    setSelectedGroup(node);
  };

  const handleDrop = (draggedId: string, targetId: string) => {
    // No-op in demo mode
  };

  const handleDelete = (groupId: string) => {
    // No-op in demo mode
  };

  const typeBadge = (type: string) => {
    switch (type) {
      case "dynamic":
        return <Badge variant="secondary" className="gap-1"><Zap className="h-3 w-3" /> Dynamic</Badge>;
      case "ldap":
        return <Badge variant="secondary" className="gap-1"><Globe className="h-3 w-3" /> LDAP</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><FolderTree className="h-3 w-3" /> Static</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Groups"
        description="Organize devices into groups for policy assignment"
        actions={
          <Button onClick={() => router.push("/groups/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Group
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Tree panel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Group Hierarchy</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-muted/50 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <GroupTree
                nodes={tree}
                selectedId={selectedGroup?.id}
                onSelect={handleSelect}
              />
            )}
          </CardContent>
        </Card>

        {/* Detail panel */}
        <Card>
          {selectedGroup ? (
            <>
              <CardHeader className="flex flex-row items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle>{selectedGroup.name}</CardTitle>
                    {typeBadge(selectedGroup.type)}
                  </div>
                  <CardDescription>
                    {selectedGroup.description || "No description"}
                  </CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push(`/groups/${selectedGroup.id}`)}>
                      <Pencil className="mr-2 h-4 w-4" /> View Details
                    </DropdownMenuItem>
                    {selectedGroup.type === "dynamic" && (
                      <DropdownMenuItem onClick={() => router.push(`/groups/${selectedGroup.id}?tab=rules`)}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Re-evaluate
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDelete(selectedGroup.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-2xl font-bold">{selectedGroup.memberCount}</div>
                    <div className="text-xs text-muted-foreground">Devices</div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-2xl font-bold">{selectedGroup.children?.length ?? 0}</div>
                    <div className="text-xs text-muted-foreground">Sub-groups</div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-2xl font-bold">{selectedGroup.depth}</div>
                    <div className="text-xs text-muted-foreground">Depth</div>
                  </div>
                </div>

                <div className="mt-4">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push(`/groups/${selectedGroup.id}`)}
                  >
                    View Full Details
                  </Button>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
              Select a group from the tree to view details
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
