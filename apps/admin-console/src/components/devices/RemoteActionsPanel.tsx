"use client";

import * as React from "react";
import { Lock, Trash2, RotateCcw, MessageSquare, MapPin, Bell, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useRemoteAction } from "@/hooks/mutations/use-remote-action";

interface RemoteActionsPanelProps {
  deviceId: string;
  onActionComplete?: (type: string, success: boolean) => void;
}

type ActionType = "lock" | "wipe" | "selective_wipe" | "reboot" | "send_message" | "locate" | "ring";

const actions: { type: ActionType; label: string; icon: React.ElementType; variant?: "destructive" | "outline" }[] = [
  { type: "lock", label: "Lock", icon: Lock, variant: "outline" },
  { type: "wipe", label: "Wipe", icon: Trash2, variant: "destructive" },
  { type: "selective_wipe", label: "Selective Wipe", icon: ShieldOff, variant: "destructive" },
  { type: "reboot", label: "Reboot", icon: RotateCcw, variant: "outline" },
  { type: "send_message", label: "Send Message", icon: MessageSquare, variant: "outline" },
  { type: "locate", label: "Locate", icon: MapPin, variant: "outline" },
  { type: "ring", label: "Ring Device", icon: Bell, variant: "outline" },
];

export function RemoteActionsPanel({ deviceId, onActionComplete }: RemoteActionsPanelProps) {
  const [activeAction, setActiveAction] = React.useState<ActionType | null>(null);
  const [wipeConfirm, setWipeConfirm] = React.useState("");
  const [message, setMessage] = React.useState("");
  const mutation = useRemoteAction(deviceId);

  const handleConfirm = () => {
    if (!activeAction) return;

    const payload: Record<string, unknown> = {};
    if (activeAction === "send_message") {
      payload.message = message;
    }

    mutation.mutate(
      { type: activeAction, payload },
      {
        onSuccess: () => {
          onActionComplete?.(activeAction, true);
          closeDialog();
        },
        onError: () => {
          onActionComplete?.(activeAction, false);
        },
      },
    );
  };

  const closeDialog = () => {
    setActiveAction(null);
    setWipeConfirm("");
    setMessage("");
  };

  const isWipeAction = activeAction === "wipe" || activeAction === "selective_wipe";
  const canConfirm =
    isWipeAction ? wipeConfirm === "WIPE" : true;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.type}
            variant={action.variant ?? "outline"}
            size="sm"
            onClick={() => setActiveAction(action.type)}
          >
            <action.icon className="mr-2 h-4 w-4" />
            {action.label}
          </Button>
        ))}
      </div>

      <Dialog open={activeAction !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {activeAction === "wipe" && "Wipe Device"}
              {activeAction === "selective_wipe" && "Selective Wipe"}
              {activeAction === "lock" && "Lock Device"}
              {activeAction === "reboot" && "Reboot Device"}
              {activeAction === "send_message" && "Send Message"}
              {activeAction === "locate" && "Locate Device"}
              {activeAction === "ring" && "Ring Device"}
            </DialogTitle>
            <DialogDescription>
              {isWipeAction
                ? "This action will permanently erase data from the device. This cannot be undone."
                : `Are you sure you want to ${activeAction?.replace("_", " ")} this device?`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {isWipeAction && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  Type WIPE to confirm this action:
                </p>
                <Input
                  value={wipeConfirm}
                  onChange={(e) => setWipeConfirm(e.target.value)}
                  placeholder="Type WIPE"
                />
              </div>
            )}

            {activeAction === "send_message" && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Message:</p>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter message to send to device..."
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant={isWipeAction ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={!canConfirm || mutation.isPending}
            >
              {mutation.isPending ? "Sending..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
