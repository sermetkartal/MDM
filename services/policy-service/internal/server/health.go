package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/nats-io/nats.go"
)

// HealthServer provides HTTP health check endpoints alongside gRPC.
type HealthServer struct {
	db  *sql.DB
	nc  *nats.Conn
	srv *http.Server
}

type dependencyStatus struct {
	Status    string `json:"status"`
	LatencyMs int64  `json:"latency_ms,omitempty"`
}

type liveResponse struct {
	Status       string                      `json:"status"`
	Dependencies map[string]dependencyStatus `json:"dependencies"`
}

// NewHealthServer creates a health HTTP server on the given address.
func NewHealthServer(addr string, db *sql.DB, nc *nats.Conn) *HealthServer {
	h := &HealthServer{db: db, nc: nc}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.handleHealthz)
	mux.HandleFunc("GET /readyz", h.handleReadyz)
	mux.HandleFunc("GET /livez", h.handleLivez)

	h.srv = &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	return h
}

// Start begins listening in a goroutine. Call Shutdown to stop.
func (h *HealthServer) Start() {
	go func() {
		slog.Info("health server starting", "addr", h.srv.Addr)
		if err := h.srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("health server failed", "error", err)
		}
	}()
}

// Shutdown gracefully stops the health server.
func (h *HealthServer) Shutdown(ctx context.Context) error {
	return h.srv.Shutdown(ctx)
}

func (h *HealthServer) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func (h *HealthServer) handleReadyz(w http.ResponseWriter, _ *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if h.db != nil {
		if err := h.db.PingContext(ctx); err != nil {
			http.Error(w, "postgres not ready", http.StatusServiceUnavailable)
			return
		}
	}

	if h.nc != nil && !h.nc.IsConnected() {
		http.Error(w, "nats not ready", http.StatusServiceUnavailable)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func (h *HealthServer) handleLivez(w http.ResponseWriter, _ *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	resp := liveResponse{
		Status:       "healthy",
		Dependencies: make(map[string]dependencyStatus),
	}

	pgStart := time.Now()
	pgStatus := dependencyStatus{Status: "up"}
	if h.db != nil {
		if err := h.db.PingContext(ctx); err != nil {
			pgStatus.Status = "down"
			resp.Status = "unhealthy"
		}
		pgStatus.LatencyMs = time.Since(pgStart).Milliseconds()
	} else {
		pgStatus.Status = "not_configured"
	}
	resp.Dependencies["postgres"] = pgStatus

	natsStatus := dependencyStatus{Status: "up"}
	if h.nc != nil {
		if !h.nc.IsConnected() {
			natsStatus.Status = "down"
			resp.Status = "unhealthy"
		}
	} else {
		natsStatus.Status = "not_configured"
	}
	resp.Dependencies["nats"] = natsStatus

	w.Header().Set("Content-Type", "application/json")
	if resp.Status != "healthy" {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	json.NewEncoder(w).Encode(resp)
}
