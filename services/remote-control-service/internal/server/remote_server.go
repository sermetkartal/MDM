package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/remote-control-service/internal/config"
	"github.com/sermetkartal/mdm/services/remote-control-service/internal/handler"
	"github.com/sermetkartal/mdm/services/remote-control-service/internal/repository"
	"github.com/sermetkartal/mdm/services/remote-control-service/internal/signaling"
	"google.golang.org/grpc"
)

type RemoteControlServer struct {
	cfg        *config.Config
	nc         *nats.Conn
	repo       *repository.SessionRepository
	relay      *signaling.Relay
	handler    *handler.RemoteHandler
	httpHandler *handler.HTTPHandler
	sigService *handler.SignalingService
	httpServer *http.Server
	cancelCleanup context.CancelFunc
}

func NewRemoteControlServer(cfg *config.Config) (*RemoteControlServer, error) {
	nc, err := nats.Connect(cfg.NATSUrl)
	if err != nil {
		slog.Warn("failed to connect to NATS, continuing without event bus", "error", err)
	} else {
		slog.Info("connected to NATS")
	}

	repo := repository.NewSessionRepository()
	relay := signaling.NewRelay(nc)
	h := handler.NewRemoteHandler(repo, relay, nc, cfg)
	httpH := handler.NewHTTPHandler(h)
	sigService := handler.NewSignalingService(h)

	return &RemoteControlServer{
		cfg:        cfg,
		nc:         nc,
		repo:       repo,
		relay:      relay,
		handler:    h,
		httpHandler: httpH,
		sigService: sigService,
	}, nil
}

func (s *RemoteControlServer) Register(grpcServer *grpc.Server) {
	s.handler.RegisterGRPC(grpcServer)
	s.sigService.RegisterGRPC(grpcServer)
}

// StartHTTP starts the HTTP server for REST and WebSocket endpoints.
func (s *RemoteControlServer) StartHTTP() error {
	mux := http.NewServeMux()
	s.httpHandler.RegisterRoutes(mux)

	// CORS middleware for admin console
	corsHandler := corsMiddleware(mux)

	s.httpServer = &http.Server{
		Addr:    ":" + s.cfg.HTTPPort,
		Handler: corsHandler,
	}

	slog.Info("HTTP server starting", "port", s.cfg.HTTPPort)
	return s.httpServer.ListenAndServe()
}

// StartCleanupLoop starts a background goroutine to clean up expired sessions.
func (s *RemoteControlServer) StartCleanupLoop(ctx context.Context) {
	cleanupCtx, cancel := context.WithCancel(ctx)
	s.cancelCleanup = cancel

	go func() {
		ticker := time.NewTicker(s.cfg.SessionCleanupInterval)
		defer ticker.Stop()

		for {
			select {
			case <-cleanupCtx.Done():
				return
			case <-ticker.C:
				s.handler.CleanupExpiredSessions()
			}
		}
	}()
}

func (s *RemoteControlServer) NC() *nats.Conn { return s.nc }

func (s *RemoteControlServer) Close() {
	if s.cancelCleanup != nil {
		s.cancelCleanup()
	}
	if s.httpServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s.httpServer.Shutdown(ctx)
	}
	if s.nc != nil {
		s.nc.Close()
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
