package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/remote-control-service/internal/model"
)

// HTTPHandler exposes REST and WebSocket endpoints for the admin console.
type HTTPHandler struct {
	remote *RemoteHandler
}

func NewHTTPHandler(remote *RemoteHandler) *HTTPHandler {
	return &HTTPHandler{remote: remote}
}

func (h *HTTPHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /sessions", h.createSession)
	mux.HandleFunc("GET /sessions/{id}", h.getSession)
	mux.HandleFunc("DELETE /sessions/{id}", h.deleteSession)
	mux.HandleFunc("GET /ws/signaling", h.signalingWebSocket)
}

type createSessionRequest struct {
	DeviceID string `json:"device_id"`
	UserID   string `json:"user_id"`
	OrgID    string `json:"org_id"`
	Quality  string `json:"quality,omitempty"`
}

type createSessionResponse struct {
	SessionID  string              `json:"session_id"`
	State      model.SessionState  `json:"state"`
	ICEServers []iceServerResponse `json:"ice_servers"`
	CreatedAt  time.Time           `json:"created_at"`
}

type iceServerResponse struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

func (h *HTTPHandler) createSession(w http.ResponseWriter, r *http.Request) {
	var req createSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	deviceID, err := uuid.Parse(req.DeviceID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device_id")
		return
	}
	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user_id")
		return
	}
	orgID, err := uuid.Parse(req.OrgID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid org_id")
		return
	}

	session, err := h.remote.CreateSession(orgID, deviceID, userID)
	if err != nil {
		if strings.Contains(err.Error(), "already has an active") {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	iceServers := make([]iceServerResponse, len(h.remote.GetICEServers()))
	for i, s := range h.remote.GetICEServers() {
		iceServers[i] = iceServerResponse{
			URLs:       s.URLs,
			Username:   s.Username,
			Credential: s.Credential,
		}
	}

	writeJSON(w, http.StatusCreated, createSessionResponse{
		SessionID:  session.ID.String(),
		State:      session.State,
		ICEServers: iceServers,
		CreatedAt:  session.CreatedAt,
	})
}

func (h *HTTPHandler) getSession(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	sessionID, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid session id")
		return
	}

	status, err := h.remote.GetSession(sessionID)
	if err != nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	writeJSON(w, http.StatusOK, status)
}

func (h *HTTPHandler) deleteSession(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	sessionID, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid session id")
		return
	}

	if err := h.remote.EndSession(sessionID); err != nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	slog.Debug("HTTP error", "status", status, "message", message)
	writeJSON(w, status, map[string]string{"error": message})
}
