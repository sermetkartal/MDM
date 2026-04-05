"use client";

import * as React from "react";
import { api } from "@/lib/api-client";

const SIGNALING_WS_URL = process.env.NEXT_PUBLIC_SIGNALING_WS_URL ?? "ws://localhost:8058";
const REMOTE_CONTROL_API_URL = process.env.NEXT_PUBLIC_REMOTE_CONTROL_API_URL ?? "http://localhost:8058";

export type SessionState = "idle" | "creating" | "connecting" | "connected" | "disconnected" | "error";
export type StreamQuality = "low" | "medium" | "high";

interface ICEServer {
  urls: string[];
  username?: string;
  credential?: string;
}

interface CreateSessionResponse {
  session_id: string;
  state: string;
  ice_servers: ICEServer[];
  created_at: string;
}

interface SessionStatus {
  id: string;
  device_id: string;
  state: string;
  quality: string;
  duration_seconds: number;
  created_at: string;
}

interface UseRemoteSessionOptions {
  deviceId: string;
  orgId: string;
  userId: string;
  onDisconnect?: () => void;
}

interface RemoteSessionReturn {
  sessionId: string | null;
  sessionState: SessionState;
  quality: StreamQuality;
  elapsedSeconds: number;
  stats: { fps: number; bitrate: number };
  videoRef: React.RefObject<HTMLVideoElement | null>;
  startSession: () => Promise<void>;
  endSession: () => Promise<void>;
  setQuality: (quality: StreamQuality) => void;
  sendTouchEvent: (event: TouchEventData) => void;
}

export interface TouchEventData {
  type: "tap" | "long_press" | "swipe" | "pinch";
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  duration?: number;
  scale?: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function useRemoteSession(options: UseRemoteSessionOptions): RemoteSessionReturn {
  const { deviceId, orgId, userId, onDisconnect } = options;

  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessionState, setSessionState] = React.useState<SessionState>("idle");
  const [quality, setQualityState] = React.useState<StreamQuality>("medium");
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [stats, setStats] = React.useState({ fps: 0, bitrate: 0 });

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = React.useRef<RTCPeerConnection | null>(null);
  const wsRef = React.useRef<WebSocket | null>(null);
  const dataChannelRef = React.useRef<RTCDataChannel | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval>>();
  const statsTimerRef = React.useRef<ReturnType<typeof setInterval>>();
  const sessionIdRef = React.useRef<string | null>(null);

  const cleanup = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (statsTimerRef.current) clearInterval(statsTimerRef.current);

    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    wsRef.current?.close();
    wsRef.current = null;

    setElapsedSeconds(0);
    setStats({ fps: 0, bitrate: 0 });
  }, []);

  const startSession = React.useCallback(async () => {
    try {
      setSessionState("creating");

      const response = await fetch(`${REMOTE_CONTROL_API_URL}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId,
          user_id: userId,
          org_id: orgId,
          quality,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to create session" }));
        throw new Error(error.error);
      }

      const data: CreateSessionResponse = await response.json();
      const newSessionId = data.session_id;
      setSessionId(newSessionId);
      sessionIdRef.current = newSessionId;

      setSessionState("connecting");

      // Set up WebRTC PeerConnection
      const iceServers: RTCIceServer[] = data.ice_servers
        .filter((s) => s.urls.length > 0)
        .map((s) => ({
          urls: s.urls,
          username: s.username || undefined,
          credential: s.credential || undefined,
        }));

      const pc = new RTCPeerConnection({ iceServers });
      peerConnectionRef.current = pc;

      // Create data channel for touch events
      const dc = pc.createDataChannel("control", { ordered: true });
      dataChannelRef.current = dc;

      dc.onopen = () => {
        console.log("Data channel opened");
      };

      // Handle incoming video track
      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
        }
      };

      // Connect WebSocket for signaling
      const ws = new WebSocket(`${SIGNALING_WS_URL}/ws/signaling?session_id=${newSessionId}`);
      wsRef.current = ws;

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "candidate",
            to: "device",
            payload: JSON.stringify({
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              sdp: event.candidate.candidate,
            }),
          }));
        }
      };

      pc.oniceconnectionstatechange = () => {
        switch (pc.iceConnectionState) {
          case "connected":
            setSessionState("connected");
            break;
          case "disconnected":
          case "failed":
          case "closed":
            setSessionState("disconnected");
            onDisconnect?.();
            break;
        }
      };

      ws.onopen = () => {
        // Create and send offer
        pc.createOffer().then((offer) => {
          pc.setLocalDescription(offer).then(() => {
            ws.send(JSON.stringify({
              type: "offer",
              to: "device",
              payload: offer.sdp,
            }));
          });
        });
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case "answer": {
              const answer = new RTCSessionDescription({
                type: "answer",
                sdp: msg.payload,
              });
              pc.setRemoteDescription(answer);
              break;
            }
            case "candidate": {
              const candidateData = JSON.parse(msg.payload);
              const candidate = new RTCIceCandidate({
                sdpMid: candidateData.sdpMid,
                sdpMLineIndex: candidateData.sdpMLineIndex,
                candidate: candidateData.sdp,
              });
              pc.addIceCandidate(candidate);
              break;
            }
            case "bye": {
              setSessionState("disconnected");
              cleanup();
              onDisconnect?.();
              break;
            }
          }
        } catch {
          // Ignore invalid messages
        }
      };

      ws.onclose = () => {
        if (sessionState === "connected" || sessionState === "connecting") {
          setSessionState("disconnected");
        }
      };

      // Start elapsed time counter
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      // Start stats collection
      statsTimerRef.current = setInterval(async () => {
        if (!peerConnectionRef.current) return;
        try {
          const report = await peerConnectionRef.current.getStats();
          report.forEach((stat) => {
            if (stat.type === "inbound-rtp" && stat.kind === "video") {
              const fps = stat.framesPerSecond ?? 0;
              const bytesReceived = stat.bytesReceived ?? 0;
              const timestamp = stat.timestamp ?? 0;
              // Simple bitrate calculation
              setStats((prev) => ({
                fps: Math.round(fps),
                bitrate: Math.round((bytesReceived * 8) / (timestamp / 1000) / 1000),
              }));
            }
          });
        } catch {
          // Stats collection failed
        }
      }, 2000);

    } catch (error) {
      setSessionState("error");
      console.error("Failed to start remote session:", error);
    }
  }, [deviceId, orgId, userId, quality, cleanup, onDisconnect]);

  const endSession = React.useCallback(async () => {
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        await fetch(`${REMOTE_CONTROL_API_URL}/sessions/${sid}`, {
          method: "DELETE",
        });
      } catch {
        // Best effort cleanup
      }
    }

    cleanup();
    setSessionId(null);
    sessionIdRef.current = null;
    setSessionState("idle");
  }, [cleanup]);

  const setQuality = React.useCallback((newQuality: StreamQuality) => {
    setQualityState(newQuality);

    // Send quality change to device via data channel
    if (dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(JSON.stringify({
        type: "quality_change",
        quality: newQuality,
      }));
    }

    // Also send via signaling for server-side tracking
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "quality_change",
        to: "device",
        payload: JSON.stringify({ quality: newQuality }),
      }));
    }
  }, []);

  const sendTouchEvent = React.useCallback((event: TouchEventData) => {
    if (dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(JSON.stringify(event));
    }
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
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
  };
}
