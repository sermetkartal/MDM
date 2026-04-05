package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/remote-control-service/internal/model"
	"golang.org/x/net/websocket"
)

func (h *HTTPHandler) signalingWebSocket(w http.ResponseWriter, r *http.Request) {
	sessionIDStr := r.URL.Query().Get("session_id")
	if sessionIDStr == "" {
		writeError(w, http.StatusBadRequest, "session_id required")
		return
	}

	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid session_id")
		return
	}

	// Verify session exists
	if _, err := h.remote.GetSession(sessionID); err != nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	wsServer := websocket.Handler(func(ws *websocket.Conn) {
		h.handleSignalingWS(ws, sessionID)
	})
	wsServer.ServeHTTP(w, r)
}

func (h *HTTPHandler) handleSignalingWS(ws *websocket.Conn, sessionID uuid.UUID) {
	defer ws.Close()

	slog.Info("WebSocket connected for signaling", "session_id", sessionID)

	adminCh, ok := h.remote.relay.GetAdminChannel(sessionID)
	if !ok {
		slog.Error("no signaling channel for session", "session_id", sessionID)
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Forward messages from signaling channel to WebSocket (messages TO admin)
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-adminCh:
				if !ok {
					cancel()
					return
				}
				data, err := json.Marshal(msg)
				if err != nil {
					slog.Error("failed to marshal message for WS", "error", err)
					continue
				}
				if err := websocket.Message.Send(ws, string(data)); err != nil {
					slog.Debug("WebSocket send failed", "error", err)
					cancel()
					return
				}
			}
		}
	}()

	// Read messages from WebSocket and relay (messages FROM admin)
	for {
		var raw string
		if err := websocket.Message.Receive(ws, &raw); err != nil {
			slog.Debug("WebSocket receive ended", "session_id", sessionID, "error", err)
			break
		}

		var msg model.SignalingMessage
		if err := json.Unmarshal([]byte(raw), &msg); err != nil {
			slog.Error("failed to parse WS signaling message", "error", err)
			continue
		}

		msg.SessionID = sessionID
		msg.From = "admin"
		msg.Timestamp = time.Now()

		if err := h.remote.HandleSignaling(msg); err != nil {
			slog.Error("failed to handle signaling message", "error", err)
		}
	}

	slog.Info("WebSocket disconnected", "session_id", sessionID)
}
