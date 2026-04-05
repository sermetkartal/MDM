"use client";

import * as React from "react";
import { ChevronRight, ChevronDown, FolderTree, Zap, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GroupTreeNode } from "@/lib/types";

interface GroupTreeProps {
  nodes: GroupTreeNode[];
  selectedId?: string;
  onSelect: (node: GroupTreeNode) => void;
  onDrop?: (draggedId: string, targetId: string) => void;
}

interface TreeNodeProps {
  node: GroupTreeNode;
  depth: number;
  selectedId?: string;
  onSelect: (node: GroupTreeNode) => void;
  onDrop?: (draggedId: string, targetId: string) => void;
}

function TreeNode({ node, depth, selectedId, onSelect, onDrop }: TreeNodeProps) {
  const [expanded, setExpanded] = React.useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = node.id === selectedId;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", node.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("bg-muted/50");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("bg-muted/50");
  };

  const handleDropEvent = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("bg-muted/50");
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId && draggedId !== node.id && onDrop) {
      onDrop(draggedId, node.id);
    }
  };

  const typeIcon = node.type === "dynamic" ? (
    <Zap className="h-3.5 w-3.5 text-amber-500" />
  ) : node.type === "ldap" ? (
    <Globe className="h-3.5 w-3.5 text-blue-500" />
  ) : (
    <FolderTree className="h-3.5 w-3.5 text-muted-foreground" />
  );

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors",
          isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node)}
        draggable={!!onDrop}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropEvent}
      >
        <button
          className={cn(
            "flex items-center justify-center w-4 h-4 shrink-0",
            !hasChildren && "invisible",
          )}
          onClick={handleToggle}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        {typeIcon}
        <span className="truncate flex-1">{node.name}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{node.memberCount}</span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GroupTree({ nodes, selectedId, onSelect, onDrop }: GroupTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8 text-sm">
        No groups yet. Create your first group to get started.
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
}
