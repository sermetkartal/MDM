package server

import (
	"database/sql"
	"log/slog"
	"time"

	_ "github.com/lib/pq"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/policy-service/internal/config"
	"github.com/sermetkartal/mdm/services/policy-service/internal/engine"
	"github.com/sermetkartal/mdm/services/policy-service/internal/handler"
	"github.com/sermetkartal/mdm/services/policy-service/internal/repository"
	"google.golang.org/grpc"
)

type PolicyServer struct {
	cfg     *config.Config
	db      *sql.DB
	nc      *nats.Conn
	repo    *repository.PolicyRepository
	handler *handler.PolicyHandler
}

func NewPolicyServer(cfg *config.Config) (*PolicyServer, error) {
	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(50)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, err
	}
	slog.Info("connected to PostgreSQL")

	nc, err := nats.Connect(cfg.NATSUrl)
	if err != nil {
		slog.Warn("failed to connect to NATS, continuing without event bus", "error", err)
	} else {
		slog.Info("connected to NATS")
	}

	repo := repository.NewPolicyRepository(db)
	resolver := engine.NewResolver(repo)
	h := handler.NewPolicyHandler(repo, resolver, nc)

	return &PolicyServer{
		cfg:     cfg,
		db:      db,
		nc:      nc,
		repo:    repo,
		handler: h,
	}, nil
}

func (s *PolicyServer) Register(grpcServer *grpc.Server) {
	s.handler.RegisterGRPC(grpcServer)
}

// DB returns the database connection for health checks.
func (s *PolicyServer) DB() *sql.DB { return s.db }

// NC returns the NATS connection for health checks.
func (s *PolicyServer) NC() *nats.Conn { return s.nc }

func (s *PolicyServer) Close() {
	if s.nc != nil {
		s.nc.Close()
	}
	if s.db != nil {
		s.db.Close()
	}
}
