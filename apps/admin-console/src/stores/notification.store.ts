import { create } from "zustand";

export interface Notification {
  id: string;
  org_id: string;
  user_id: string | null;
  device_id: string | null;
  type: "device" | "compliance" | "command" | "certificate" | "geofence" | "system";
  title: string;
  body: string;
  data: Record<string, string>;
  read_at: string | null;
  created_at: string;
}

const MAX_NOTIFICATIONS = 100;

interface NotificationState {
  unreadCount: number;
  notifications: Notification[];
  setUnreadCount: (count: number) => void;
  setNotifications: (notifications: Notification[]) => void;
  appendNotifications: (notifications: Notification[]) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  notifications: [],
  setUnreadCount: (count) => set({ unreadCount: count }),
  setNotifications: (notifications) => set({ notifications }),
  appendNotifications: (newNotifications) =>
    set((state) => {
      const merged = [
        ...state.notifications,
        ...newNotifications.filter(
          (n) => !state.notifications.some((existing) => existing.id === n.id)
        ),
      ];
      // Keep only the most recent notifications to limit memory usage
      const trimmed = merged.length > MAX_NOTIFICATIONS
        ? merged.slice(merged.length - MAX_NOTIFICATIONS)
        : merged;
      return { notifications: trimmed };
    }),
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - (state.notifications.find((n) => n.id === id && !n.read_at) ? 1 : 0)),
    })),
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({
        ...n,
        read_at: n.read_at ?? new Date().toISOString(),
      })),
      unreadCount: 0,
    })),
}));
