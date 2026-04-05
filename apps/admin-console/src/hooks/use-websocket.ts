"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { deviceKeys } from "@/hooks/queries/use-devices";

interface WebSocketMessage {
  channel: string;
  event: string;
  data: Record<string, unknown>;
}

interface UseWebSocketOptions {
  url?: string;
  channels?: string[];
  onMessage?: (msg: WebSocketMessage) => void;
}

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";
const DEFAULT_CHANNELS = ["devices:status", "commands:updates", "compliance:alerts"];
const MAX_RECONNECT_DELAY = 30000;

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    url = DEFAULT_WS_URL,
    channels = DEFAULT_CHANNELS,
    onMessage,
  } = options;

  const queryClient = useQueryClient();
  const wsRef = React.useRef<WebSocket | null>(null);
  const reconnectAttemptRef = React.useRef(0);
  const reconnectTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>();
  const [isConnected, setIsConnected] = React.useState(false);

  const connect = React.useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptRef.current = 0;

        // Subscribe to channels
        for (const channel of channels) {
          ws.send(JSON.stringify({ action: "subscribe", channel }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WebSocketMessage;
          onMessage?.(msg);

          // Handle built-in channel events
          switch (msg.channel) {
            case "devices:status":
              queryClient.invalidateQueries({ queryKey: deviceKeys.all });
              break;
            case "commands:updates":
              // Invalidate device queries when commands update
              queryClient.invalidateQueries({ queryKey: deviceKeys.all });
              break;
            case "compliance:alerts":
              queryClient.invalidateQueries({ queryKey: deviceKeys.all });
              break;
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      scheduleReconnect();
    }
  }, [url, channels, onMessage, queryClient]);

  const scheduleReconnect = React.useCallback(() => {
    const attempt = reconnectAttemptRef.current;
    const delay = Math.min(1000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
    reconnectAttemptRef.current = attempt + 1;

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  const disconnect = React.useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  React.useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { isConnected, disconnect, reconnect: connect };
}
