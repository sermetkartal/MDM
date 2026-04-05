"use client";

import * as React from "react";
import {
  Maximize,
  Minimize,
  MonitorOff,
  Signal,
  SignalLow,
  SignalMedium,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useRemoteSession,
  type StreamQuality,
  type TouchEventData,
} from "@/hooks/use-remote-session";

interface RemoteViewerProps {
  sessionId: string | null;
  deviceId: string;
  orgId: string;
  userId: string;
  onDisconnect?: () => void;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(String(h).padStart(2, "0"));
  parts.push(String(m).padStart(2, "0"));
  parts.push(String(s).padStart(2, "0"));
  return parts.join(":");
}

export function RemoteViewer({ deviceId, orgId, userId, onDisconnect }: RemoteViewerProps) {
  const {
    sessionId,
    sessionState,
    quality,
    elapsedSeconds,
    stats,
    videoRef,
    startSession,
    endSession,
    setQuality,
    sendTouchEvent,
  } = useRemoteSession({ deviceId, orgId, userId, onDisconnect });

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const toggleFullscreen = React.useCallback(() => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  React.useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const handleMouseEvent = React.useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      if (sessionState !== "connected" || !videoRef.current) return;

      const rect = videoRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      if (x < 0 || x > 1 || y < 0 || y > 1) return;

      const touchEvent: TouchEventData = {
        type: "tap",
        x,
        y,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
      };

      sendTouchEvent(touchEvent);
    },
    [sessionState, videoRef, sendTouchEvent],
  );

  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      // Mouse move could be used for hover effects or drag gestures
      // Currently only tap events are sent on click
    },
    [],
  );

  const connectionStatusBadge = React.useMemo(() => {
    switch (sessionState) {
      case "idle":
        return <Badge variant="secondary">Ready</Badge>;
      case "creating":
        return (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Creating...
          </Badge>
        );
      case "connecting":
        return (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Connecting...
          </Badge>
        );
      case "connected":
        return (
          <Badge variant="success">
            <Wifi className="mr-1 h-3 w-3" />
            Connected
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="destructive">
            <WifiOff className="mr-1 h-3 w-3" />
            Disconnected
          </Badge>
        );
      case "error":
        return <Badge variant="destructive">Error</Badge>;
    }
  }, [sessionState]);

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      {/* Controls Bar */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <div className="flex items-center gap-3">
          {connectionStatusBadge}

          {sessionState === "connected" && (
            <>
              <span className="text-sm text-muted-foreground">
                {formatElapsed(elapsedSeconds)}
              </span>
              <span className="text-xs text-muted-foreground">
                {stats.fps} FPS
              </span>
              <span className="text-xs text-muted-foreground">
                {stats.bitrate} kbps
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quality Selector */}
          <Select
            value={quality}
            onValueChange={(value) => setQuality(value as StreamQuality)}
            disabled={sessionState !== "connected" && sessionState !== "idle"}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">
                <span className="flex items-center gap-1">
                  <SignalLow className="h-3 w-3" /> Low
                </span>
              </SelectItem>
              <SelectItem value="medium">
                <span className="flex items-center gap-1">
                  <SignalMedium className="h-3 w-3" /> Medium
                </span>
              </SelectItem>
              <SelectItem value="high">
                <span className="flex items-center gap-1">
                  <Signal className="h-3 w-3" /> High
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Fullscreen Toggle */}
          <Button variant="outline" size="icon" onClick={toggleFullscreen}>
            {isFullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </Button>

          {/* Start/End Session */}
          {sessionState === "idle" || sessionState === "disconnected" || sessionState === "error" ? (
            <Button onClick={startSession}>
              Start Session
            </Button>
          ) : (
            <Button variant="destructive" onClick={endSession}>
              <MonitorOff className="mr-2 h-4 w-4" />
              End Session
            </Button>
          )}
        </div>
      </div>

      {/* Video Display */}
      <div className="relative flex items-center justify-center rounded-lg border bg-black">
        {sessionState === "idle" && (
          <div className="flex h-[480px] items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MonitorOff className="mx-auto h-12 w-12 opacity-50" />
              <p className="mt-4 text-sm">
                Click &quot;Start Session&quot; to begin remote viewing
              </p>
            </div>
          </div>
        )}

        {(sessionState === "creating" || sessionState === "connecting") && (
          <div className="flex h-[480px] items-center justify-center">
            <div className="text-center text-white">
              <Loader2 className="mx-auto h-8 w-8 animate-spin" />
              <p className="mt-4 text-sm">
                {sessionState === "creating" ? "Creating session..." : "Connecting to device..."}
              </p>
            </div>
          </div>
        )}

        {sessionState === "error" && (
          <div className="flex h-[480px] items-center justify-center text-destructive">
            <div className="text-center">
              <WifiOff className="mx-auto h-12 w-12 opacity-50" />
              <p className="mt-4 text-sm">
                Failed to connect. Please try again.
              </p>
            </div>
          </div>
        )}

        {sessionState === "disconnected" && (
          <div className="flex h-[480px] items-center justify-center text-muted-foreground">
            <div className="text-center">
              <WifiOff className="mx-auto h-12 w-12 opacity-50" />
              <p className="mt-4 text-sm">
                Session disconnected. Click &quot;Start Session&quot; to reconnect.
              </p>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onClick={handleMouseEvent}
          onMouseMove={handleMouseMove}
          className={`max-h-[720px] w-full rounded-lg object-contain ${
            sessionState === "connected" ? "cursor-pointer" : "hidden"
          }`}
          style={{ aspectRatio: "16/9" }}
        />
      </div>
    </div>
  );
}
