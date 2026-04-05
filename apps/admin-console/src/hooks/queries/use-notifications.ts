"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { useNotificationStore, type Notification } from "@/stores/notification.store";
import { useEffect } from "react";

interface NotificationsResponse {
  notifications: Notification[];
  total: number;
}

interface UnreadCountResponse {
  count: number;
}

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (params: { offset?: number; unread_only?: boolean }) =>
    [...notificationKeys.all, "list", params] as const,
  unreadCount: () => [...notificationKeys.all, "unread-count"] as const,
};

export function useNotifications(params: { offset?: number; limit?: number; unread_only?: boolean } = {}) {
  const orgId = useAuthStore((s) => s.currentOrg?.id);
  const userId = useAuthStore((s) => s.user?.id);
  const { setNotifications, appendNotifications } = useNotificationStore();

  const query = useQuery({
    queryKey: notificationKeys.list({ offset: params.offset, unread_only: params.unread_only }),
    queryFn: () => {
      const searchParams = new URLSearchParams({
        org_id: orgId!,
        limit: String(params.limit ?? 20),
        offset: String(params.offset ?? 0),
      });
      if (userId) searchParams.set("user_id", userId);
      if (params.unread_only) searchParams.set("unread_only", "true");

      return api.get<NotificationsResponse>(`/v1/notifications?${searchParams.toString()}`);
    },
    enabled: !!orgId,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (query.data) {
      if (params.offset && params.offset > 0) {
        appendNotifications(query.data.notifications);
      } else {
        setNotifications(query.data.notifications);
      }
    }
  }, [query.data, params.offset, setNotifications, appendNotifications]);

  return query;
}

export function useUnreadCount() {
  const orgId = useAuthStore((s) => s.currentOrg?.id);
  const userId = useAuthStore((s) => s.user?.id);
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  const query = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => {
      const searchParams = new URLSearchParams({ org_id: orgId! });
      if (userId) searchParams.set("user_id", userId);
      return api.get<UnreadCountResponse>(`/v1/notifications/unread-count?${searchParams.toString()}`);
    },
    enabled: !!orgId,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (query.data) {
      setUnreadCount(query.data.count);
    }
  }, [query.data, setUnreadCount]);

  return query;
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const markAsRead = useNotificationStore((s) => s.markAsRead);

  return useMutation({
    mutationFn: (notificationId: string) =>
      api.patch(`/v1/notifications/${notificationId}/read`),
    onMutate: (notificationId) => {
      markAsRead(notificationId);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrg?.id);
  const userId = useAuthStore((s) => s.user?.id);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);

  return useMutation({
    mutationFn: () =>
      api.post("/v1/notifications/mark-all-read", { org_id: orgId, user_id: userId }),
    onMutate: () => {
      markAllAsRead();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
