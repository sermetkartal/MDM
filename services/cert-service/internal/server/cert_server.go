package server

import (
	"database/sql"
	"log/slog"
	"net/http"
	"time"

	_ "github.com/lib/pq"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/cert-service/internal/ca"
	"github.com/sermetkartal/mdm/services/cert-service/internal/config"
	"github.com/sermetkartal/mdm/services/cert-service/internal/handler"
	"github.com/sermetkartal/mdm/services/cert-service/internal/repository"
	"github.com/sermetkartal/mdm/services/cert-service/internal/scep"
	"google.golang.org/grpc"
)

type CertServer struct {
	cfg        *config.Config
	db         *sql.DB
	nc         *nats.Conn
	repo       *repository.CertRepository
	handler    *handler.CertHandler
	scepServer *scep.Server
	ca         *ca.CA
}

func NewCertServer(cfg *config.Config) (*CertServer, error) {
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

	// Initialize CA
	var certCA *ca.CA
	if cfg.CACertPath != "" && cfg.CAKeyPath != "" {
		certCA, err = ca.InitCA(cfg.CACertPath, cfg.CAKeyPath)
		if err != nil {
			return nil, err
		}
		slog.Info("CA initialized", "cert_path", cfg.CACertPath)
	} else {
		certCA, _, _, err = ca.GenerateSelfSignedCA("MDM")
		if err != nil {
			return nil, err
		}
		slog.Warn("using self-signed CA (development mode)")
	}

	repo := repository.NewCertRepository(db)
	h := handler.NewCertHandler(repo, certCA, nc)
	scepSrv := scep.NewServer(certCA, cfg.SCEPChallenge)

	return &CertServer{
		cfg:        cfg,
		db:         db,
		nc:         nc,
		repo:       repo,
		handler:    h,
		scepServer: scepSrv,
		ca:         certCA,
	}, nil
}

func (s *CertServer) Register(grpcServer *grpc.Server) {
	s.handler.RegisterGRPC(grpcServer)
}

// StartSCEP starts the SCEP HTTP server in a goroutine.
func (s *CertServer) StartSCEP() {
	go func() {
		addr := ":" + s.cfg.SCEPPort
		slog.Info("SCEP server starting", "addr", addr)
		srv := &http.Server{
			Addr:         addr,
			Handler:      s.scepServer.Handler(),
			ReadTimeout:  10 * time.Second,
			WriteTimeout: 10 * time.Second,
		}
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("SCEP server failed", "error", err)
		}
	}()
}

func (s *CertServer) DB() *sql.DB    { return s.db }
func (s *CertServer) NC() *nats.Conn { return s.nc }

func (s *CertServer) Close() {
	if s.nc != nil {
		s.nc.Close()
	}
	if s.db != nil {
		s.db.Close()
	}
}
