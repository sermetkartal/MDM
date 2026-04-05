package server

import (
	"database/sql"
	"log/slog"
	"time"

	_ "github.com/lib/pq"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/kiosk-service/internal/config"
	"github.com/sermetkartal/mdm/services/kiosk-service/internal/handler"
	"github.com/sermetkartal/mdm/services/kiosk-service/internal/repository"
	"google.golang.org/grpc"
)

type KioskServer struct {
	cfg     *config.Config
	db      *sql.DB
	nc      *nats.Conn
	repo    *repository.KioskRepository
	handler *handler.KioskHandler
}

func NewKioskServer(cfg *config.Config) (*KioskServer, error) {
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

	repo := repository.NewKioskRepository(db)
	h := handler.NewKioskHandler(repo, nc)

	return &KioskServer{
		cfg:     cfg,
		db:      db,
		nc:      nc,
		repo:    repo,
		handler: h,
	}, nil
}

func (s *KioskServer) Register(grpcServer *grpc.Server) {
	s.handler.RegisterGRPC(grpcServer)
}

func (s *KioskServer) DB() *sql.DB    { return s.db }
func (s *KioskServer) NC() *nats.Conn { return s.nc }

func (s *KioskServer) Close() {
	if s.nc != nil {
		s.nc.Close()
	}
	if s.db != nil {
		s.db.Close()
	}
}
