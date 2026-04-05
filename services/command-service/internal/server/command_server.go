package server

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	_ "github.com/lib/pq"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
	"github.com/sermetkartal/mdm/services/command-service/internal/config"
	"github.com/sermetkartal/mdm/services/command-service/internal/dispatcher"
	"github.com/sermetkartal/mdm/services/command-service/internal/fcm"
	"github.com/sermetkartal/mdm/services/command-service/internal/handler"
	"github.com/sermetkartal/mdm/services/command-service/internal/queue"
	"github.com/sermetkartal/mdm/services/command-service/internal/repository"
	"github.com/sermetkartal/mdm/services/command-service/internal/sweeper"
	"github.com/sermetkartal/mdm/services/command-service/internal/ws"
	"google.golang.org/grpc"
)

type CommandServer struct {
	cfg        *config.Config
	db         *sql.DB
	nc         *nats.Conn
	rdb        *redis.Client
	repo       *repository.CommandRepository
	handler    *handler.CommandHandler
	queue      *queue.NATSQueue
	dispatcher *dispatcher.Dispatcher
	sweeper    *sweeper.ExpirySweeper
	bridge     *ws.Bridge
}

func NewCommandServer(cfg *config.Config) (*CommandServer, error) {
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
		slog.Warn("failed to connect to NATS, continuing without command queue", "error", err)
	} else {
		slog.Info("connected to NATS")
	}

	// Connect to Redis
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		slog.Warn("failed to parse Redis URL", "error", err)
	}
	var rdb *redis.Client
	if opt != nil {
		rdb = redis.NewClient(opt)
		if err := rdb.Ping(context.Background()).Err(); err != nil {
			slog.Warn("failed to connect to Redis", "error", err)
			rdb = nil
		} else {
			slog.Info("connected to Redis")
		}
	}

	repo := repository.NewCommandRepository(db)

	var q *queue.NATSQueue
	if nc != nil {
		q, err = queue.NewNATSQueue(nc)
		if err != nil {
			slog.Warn("failed to initialize JetStream queue", "error", err)
		}
	}

	fcmClient, err := fcm.NewClient(cfg.FCMCredentials)
	if err != nil {
		slog.Warn("failed to initialize FCM client", "error", err)
	}

	tokenLookup := dispatcher.NewDBTokenLookup(db)
	d := dispatcher.NewDispatcher(repo, fcmClient, q, tokenLookup)
	sw := sweeper.NewExpirySweeper(repo, q, time.Duration(cfg.ExpiryCheckSecs)*time.Second)
	h := handler.NewCommandHandler(repo, q, nc)

	// WebSocket bridge
	var bridge *ws.Bridge
	if nc != nil && rdb != nil {
		bridge = ws.NewBridge(nc, rdb)
	}

	return &CommandServer{
		cfg:        cfg,
		db:         db,
		nc:         nc,
		rdb:        rdb,
		repo:       repo,
		handler:    h,
		queue:      q,
		dispatcher: d,
		sweeper:    sw,
		bridge:     bridge,
	}, nil
}

func (s *CommandServer) Register(grpcServer *grpc.Server) {
	s.handler.RegisterGRPC(grpcServer)
}

func (s *CommandServer) StartWorkers(ctx context.Context) {
	// Start queue consumer
	if s.queue != nil {
		if err := s.queue.Subscribe(ctx, s.dispatcher.HandleCommand); err != nil {
			slog.Error("failed to start queue subscriber", "error", err)
		}
	}

	// Start expiry sweeper
	s.sweeper.Start(ctx)

	// Start WebSocket bridge
	if s.bridge != nil {
		if err := s.bridge.Start(ctx); err != nil {
			slog.Error("failed to start ws bridge", "error", err)
		}
	}
}

// Bridge returns the WebSocket bridge for HTTP handler registration.
func (s *CommandServer) Bridge() *ws.Bridge {
	return s.bridge
}

// DB returns the database connection for health checks.
func (s *CommandServer) DB() *sql.DB { return s.db }

// NC returns the NATS connection for health checks.
func (s *CommandServer) NC() *nats.Conn { return s.nc }

// RDB returns the Redis client for health checks.
func (s *CommandServer) RDB() *redis.Client { return s.rdb }

func (s *CommandServer) Close() {
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
