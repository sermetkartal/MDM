"use client";

import * as React from "react";
import { Plus, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { RuleGroup, RuleCondition } from "@/lib/types";

const FIELDS = [
  { value: "os_version", label: "OS Version" },
  { value: "model", label: "Device Model" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "platform", label: "Platform" },
  { value: "status", label: "Enrollment Status" },
  { value: "compliance_status", label: "Compliance State" },
  { value: "agent_version", label: "Agent Version" },
  { value: "last_seen_at", label: "Last Seen (relative)" },
];

const OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "greater or equal" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "less or equal" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "starts_with", label: "starts with" },
  { value: "in", label: "in (comma-separated)" },
  { value: "regex", label: "matches regex" },
];

interface DynamicRuleBuilderProps {
  value: RuleGroup;
  onChange: (rules: RuleGroup) => void;
  previewCount?: number | null;
  onPreview?: () => void;
  previewLoading?: boolean;
}

export function DynamicRuleBuilder({
  value,
  onChange,
  previewCount,
  onPreview,
  previewLoading,
}: DynamicRuleBuilderProps) {
  const conditions = value.conditions as RuleCondition[];

  const toggleOperator = () => {
    onChange({ ...value, operator: value.operator === "and" ? "or" : "and" });
  };

  const addCondition = () => {
    onChange({
      ...value,
      conditions: [
        ...value.conditions,
        { field: "os_version", op: "eq", value: "" },
      ],
    });
  };

  const removeCondition = (index: number) => {
    const updated = [...value.conditions];
    updated.splice(index, 1);
    onChange({ ...value, conditions: updated });
  };

  const updateCondition = (index: number, updates: Partial<RuleCondition>) => {
    const updated = [...value.conditions] as RuleCondition[];
    updated[index] = { ...updated[index], ...updates };
    onChange({ ...value, conditions: updated });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Match</span>
        <Button variant="outline" size="sm" onClick={toggleOperator}>
          {value.operator === "and" ? "ALL" : "ANY"}
        </Button>
        <span className="text-sm text-muted-foreground">of the following conditions</span>
      </div>

      <div className="space-y-2">
        {conditions.map((condition, index) => (
          <div key={index} className="flex items-center gap-2">
            {index > 0 && (
              <Badge variant="secondary" className="shrink-0 text-xs uppercase">
                {value.operator}
              </Badge>
            )}
            <select
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={condition.field}
              onChange={(e) => updateCondition(index, { field: e.target.value })}
            >
              {FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={condition.op}
              onChange={(e) => updateCondition(index, { op: e.target.value })}
            >
              {OPERATORS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Input
              placeholder={condition.field === "last_seen_at" ? "e.g. 7d, 30d" : "Value"}
              value={typeof condition.value === "string" ? condition.value : condition.value.join(", ")}
              onChange={(e) => updateCondition(index, { value: e.target.value })}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => removeCondition(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addCondition}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Condition
        </Button>
        {onPreview && (
          <Button
            variant="outline"
            size="sm"
            onClick={onPreview}
            disabled={previewLoading || conditions.length === 0}
          >
            <Eye className="mr-1 h-3.5 w-3.5" />
            {previewLoading ? "Checking..." : "Preview"}
          </Button>
        )}
        {previewCount !== null && previewCount !== undefined && (
          <Badge variant="secondary">
            {previewCount} device{previewCount !== 1 ? "s" : ""} match
          </Badge>
        )}
      </div>
    </div>
  );
}
