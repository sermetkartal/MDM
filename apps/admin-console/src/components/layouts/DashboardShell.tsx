"use client";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useWebSocket } from "@/hooks/use-websocket";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  // Connect to WebSocket for real-time updates
  useWebSocket();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
