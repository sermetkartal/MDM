"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Monitor,
  ShieldAlert,
  Terminal,
  Key,
  MapPin,
  Bell,
  CheckCheck,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotificationStore, type Notification } from "@/stores/notification.store";
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
} from "@/hooks/queries/use-notifications";

const TYPE_ICONS: Record<string, React.ElementType> = {
  device: Monitor,
  compliance: ShieldAlert,
  command: Terminal,
  certificate: Key,
  geofence: MapPin,
  system: Bell,
};

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString();
}

function getNavigationUrl(notification: Notification): string | null {
  if (notification.device_id) return `/devices/${notification.device_id}`;
  if (notification.type === "compliance") return "/reports";
  if (notification.type === "geofence") return "/geofencing";
  if (notification.type === "certificate") return "/settings/integrations";
  return null;
}

function NotificationItem({
  notification,
  onMarkRead,
  onNavigate,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onNavigate: (url: string) => void;
}) {
  const Icon = TYPE_ICONS[notification.type] ?? Bell;
  const isUnread = !notification.read_at;
  const url = getNavigationUrl(notification);

  const handleClick = () => {
    if (isUnread) onMarkRead(notification.id);
    if (url) onNavigate(url);
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-start gap-3 w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors"
    >
      <div className="mt-0.5 rounded-full bg-muted p-2 shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{notification.title}</span>
          {isUnread && (
            <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          {notification.body}
        </p>
        <span className="text-xs text-muted-foreground mt-1 block">
          {getRelativeTime(notification.created_at)}
        </span>
      </div>
    </button>
  );
}

export function NotificationCenter({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useNotifications({ offset, limit: 20 });
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAsReadMutation = useMarkAsRead();
  const markAllAsReadMutation = useMarkAllAsRead();

  const total = data?.total ?? 0;
  const hasMore = notifications.length < total;

  const handleMarkRead = useCallback(
    (id: string) => markAsReadMutation.mutate(id),
    [markAsReadMutation]
  );

  const handleNavigate = useCallback(
    (url: string) => {
      onOpenChange(false);
      router.push(url);
    },
    [onOpenChange, router]
  );

  const handleLoadMore = useCallback(() => {
    setOffset(notifications.length);
  }, [notifications.length]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-hidden">
        <SheetHeader className="pb-2">
          <div className="flex items-center justify-between">
            <SheetTitle>
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({unreadCount} unread)
                </span>
              )}
            </SheetTitle>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
              >
                <CheckCheck className="h-4 w-4 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {isLoading && notifications.length === 0 ? (
            <div className="space-y-3 pt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="space-y-1 pt-2">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                  onNavigate={handleNavigate}
                />
              ))}
              {hasMore && (
                <div className="py-3 text-center">
                  <Button variant="ghost" size="sm" onClick={handleLoadMore}>
                    Load more
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
