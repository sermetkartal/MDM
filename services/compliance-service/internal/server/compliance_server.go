package server

import (
	"database/sql"
	"log/slog"
	"time"

	_ "github.com/lib/pq"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/config"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/engine"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/handler"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/repository"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/service"
	"github.com/sermetkartal/mdm/services/compliance-service/internal/subscriber"
	"google.golang.org/grpc"
)

type ComplianceServer struct {
	cfg                *config.Config
	db                 *sql.DB
	nc                 *nats.Conn
	repo               *repository.ComplianceRepository
	handler            *handler.ComplianceHandler
	scoring            *service.ScoringService
	heartbeatSub       *subscriber.HeartbeatSubscriber
	gracePeriodChecker *service.GracePeriodChecker
}

func NewComplianceServer(cfg *config.Config) (*ComplianceServer, error) {
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

	repo := repository.NewComplianceRepository(db)
	evaluator := engine.NewEvaluator()
	h := handler.NewComplianceHandler(repo, evaluator, nc)
	scoring := service.NewScoringService(repo)

	// NATS heartbeat subscriber for event-driven evaluation
	heartbeatSub := subscriber.NewHeartbeatSubscriber(nc, h)
	if err := heartbeatSub.Start(); err != nil {
		slog.Error("failed to start heartbeat subscriber", "error", err)
	}

	// Grace period background checker (runs every 5 minutes)
	gracePeriodChecker := service.NewGracePeriodChecker(repo, nc, 5*time.Minute)
	gracePeriodChecker.Start()

	return &ComplianceServer{
		cfg:                cfg,
		db:                 db,
		nc:                 nc,
		repo:               repo,
		handler:            h,
		scoring:            scoring,
		heartbeatSub:       heartbeatSub,
		gracePeriodChecker: gracePeriodChecker,
	}, nil
}

func (s *ComplianceServer) Register(grpcServer *grpc.Server) {
	s.handler.RegisterGRPC(grpcServer)
}

func (s *ComplianceServer) DB() *sql.DB    { return s.db }
func (s *ComplianceServer) NC() *nats.Conn { return s.nc }

func (s *ComplianceServer) Close() {
	if s.heartbeatSub != nil {
		s.heartbeatSub.Stop()
	}
	if s.gracePeriodChecker != nil {
		s.gracePeriodChecker.Stop()
	}
	if s.nc != nil {
		s.nc.Close()
	}
	if s.db != nil {
		s.db.Close()
	}
}
