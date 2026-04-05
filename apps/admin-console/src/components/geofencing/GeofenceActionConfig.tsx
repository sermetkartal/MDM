"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus } from "lucide-react";
import type { GeofencePolicy, GeofenceTriggerType, GeofenceActionType, CreateGeofencePolicyRequest } from "@/lib/types";

interface GeofenceActionConfigProps {
  policies: GeofencePolicy[];
  onAdd: (req: CreateGeofencePolicyRequest) => void;
  onDelete: (policyId: string) => void;
  isAdding?: boolean;
}

const TRIGGER_OPTIONS: { value: GeofenceTriggerType; label: string }[] = [
  { value: "enter", label: "Enter" },
  { value: "exit", label: "Exit" },
  { value: "dwell", label: "Dwell" },
];

const ACTION_OPTIONS: { value: GeofenceActionType; label: string }[] = [
  { value: "notify", label: "Send Notification" },
  { value: "lock", label: "Lock Device" },
  { value: "restrict", label: "Restrict Access" },
  { value: "enable_policy", label: "Enable Policy" },
];

const triggerColors: Record<GeofenceTriggerType, string> = {
  enter: "bg-green-100 text-green-800",
  exit: "bg-red-100 text-red-800",
  dwell: "bg-amber-100 text-amber-800",
};

export function GeofenceActionConfig({ policies, onAdd, onDelete, isAdding }: GeofenceActionConfigProps) {
  const [trigger, setTrigger] = React.useState<GeofenceTriggerType>("enter");
  const [action, setAction] = React.useState<GeofenceActionType>("notify");
  const [policyId, setPolicyId] = React.useState("");
  const [showAdd, setShowAdd] = React.useState(false);

  function handleAdd() {
    const config: Record<string, unknown> = {};
    if (action === "enable_policy" && policyId) {
      config.policy_id = policyId;
    }
    onAdd({ trigger_type: trigger, action_type: action, action_config: config });
    setShowAdd(false);
    setPolicyId("");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Action Triggers</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="mr-1 h-3 w-3" />
          Add Action
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showAdd && (
          <div className="space-y-3 rounded-lg border border-dashed p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Trigger</label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value as GeofenceTriggerType)}
                >
                  {TRIGGER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Action</label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={action}
                  onChange={(e) => setAction(e.target.value as GeofenceActionType)}
                >
                  {ACTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {action === "enable_policy" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Policy ID</label>
                <Input
                  className="mt-1"
                  placeholder="Enter policy ID"
                  value={policyId}
                  onChange={(e) => setPolicyId(e.target.value)}
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={isAdding}>
                {isAdding ? "Adding..." : "Add"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {policies.length === 0 && !showAdd && (
          <p className="text-sm text-muted-foreground">No action triggers configured.</p>
        )}

        {policies.map((policy) => (
          <div
            key={policy.id}
            className="flex items-center justify-between rounded-lg border px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className={triggerColors[policy.triggerType]}>
                {policy.triggerType}
              </Badge>
              <span className="text-sm">
                {ACTION_OPTIONS.find((a) => a.value === policy.actionType)?.label ?? policy.actionType}
              </span>
              {policy.actionType === "enable_policy" && policy.actionConfig?.policy_id && (
                <span className="text-xs text-muted-foreground">
                  (Policy: {String(policy.actionConfig.policy_id).slice(0, 8)}...)
                </span>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => onDelete(policy.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
