package server

import (
	"database/sql"
	"log/slog"
	"time"

	_ "github.com/lib/pq"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
	"github.com/sermetkartal/mdm/services/geofence-service/internal/config"
	"github.com/sermetkartal/mdm/services/geofence-service/internal/handler"
	"github.com/sermetkartal/mdm/services/geofence-service/internal/repository"
	"google.golang.org/grpc"
)

type GeofenceServer struct {
	cfg     *config.Config
	db      *sql.DB
	nc      *nats.Conn
	rdb     *redis.Client
	repo    *repository.GeofenceRepository
	handler *handler.GeofenceHandler
}

func NewGeofenceServer(cfg *config.Config) (*GeofenceServer, error) {
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

	// Parse Redis URL and connect
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		slog.Warn("failed to parse Redis URL, continuing without Redis", "error", err)
	}
	var rdb *redis.Client
	if opt != nil {
		rdb = redis.NewClient(opt)
		slog.Info("connected to Redis")
	}

	repo := repository.NewGeofenceRepository(db)
	h := handler.NewGeofenceHandler(repo, nc, rdb)

	// Subscribe to telemetry events
	if err := h.SubscribeTelemetry(); err != nil {
		slog.Warn("failed to subscribe to telemetry", "error", err)
	}

	return &GeofenceServer{
		cfg:     cfg,
		db:      db,
		nc:      nc,
		rdb:     rdb,
		repo:    repo,
		handler: h,
	}, nil
}

func (s *GeofenceServer) Register(grpcServer *grpc.Server) {
	s.handler.RegisterGRPC(grpcServer)
}

func (s *GeofenceServer) DB() *sql.DB    { return s.db }
func (s *GeofenceServer) NC() *nats.Conn { return s.nc }

func (s *GeofenceServer) Close() {
	s.handler.Close()
	if s.nc != nil {
		s.nc.Close()
	}
	if s.rdb != nil {
		s.rdb.Close()
	}
	if s.db != nil {
		s.db.Close()
	}
}
