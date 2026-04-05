package server

import (
	"context"
	"log/slog"

	"github.com/sermetkartal/mdm/services/ios-mdm-service/internal/apns"
	"github.com/sermetkartal/mdm/services/ios-mdm-service/internal/config"
	"github.com/sermetkartal/mdm/services/ios-mdm-service/internal/dep"
	"github.com/sermetkartal/mdm/services/ios-mdm-service/internal/enrollment"
	"github.com/sermetkartal/mdm/services/ios-mdm-service/internal/mdm"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
)

type IOSMDMServer struct {
	cfg            *config.Config
	mdmServer      *mdm.Server
	queue          *mdm.Queue
	apnsClient     *apns.Client
	depClient      *dep.Client
	depSyncer      *dep.Syncer
	manualEnroll   *enrollment.ManualEnrollment
	depEnroll      *enrollment.DEPEnrollment
}

func NewIOSMDMServer(cfg *config.Config) (*IOSMDMServer, error) {
	queue, err := mdm.NewQueue(cfg.RedisURL)
	if err != nil {
		return nil, err
	}

	apnsClient, err := apns.NewClient(apns.Config{
		KeyPath:    cfg.APNsKeyPath,
		KeyID:      cfg.APNsKeyID,
		TeamID:     cfg.APNsTeamID,
		Topic:      cfg.APNsTopic,
		Production: cfg.APNsProduction,
	})
	if err != nil {
		return nil, err
	}

	mdmServer := mdm.NewServer(queue, apnsClient)

	depClient, err := dep.NewClient(cfg.DEPTokenPath, cfg.DEPServerURL)
	if err != nil {
		slog.Warn("DEP client initialization failed, DEP disabled", "error", err)
	}

	depSyncer := dep.NewSyncer(depClient, 15*60*1e9, func(ctx context.Context, serial, model, os string) {
		slog.Info("DEP device discovered", "serial", serial, "model", model, "os", os)
	})

	manualEnroll := enrollment.NewManualEnrollment(cfg.ServerURL, cfg.APNsTopic, cfg.MDMSignCert)
	depEnroll := enrollment.NewDEPEnrollment(cfg.ServerURL, cfg.APNsTopic)

	return &IOSMDMServer{
		cfg:          cfg,
		mdmServer:    mdmServer,
		queue:        queue,
		apnsClient:   apnsClient,
		depClient:    depClient,
		depSyncer:    depSyncer,
		manualEnroll: manualEnroll,
		depEnroll:    depEnroll,
	}, nil
}

func (s *IOSMDMServer) RegisterGRPC(grpcServer *grpc.Server) {
	healthServer := health.NewServer()
	grpc_health_v1.RegisterHealthServer(grpcServer, healthServer)
	healthServer.SetServingStatus("ios-mdm-service", grpc_health_v1.HealthCheckResponse_SERVING)
}

func (s *IOSMDMServer) MDMServer() *mdm.Server {
	return s.mdmServer
}

func (s *IOSMDMServer) ManualEnrollment() *enrollment.ManualEnrollment {
	return s.manualEnroll
}

func (s *IOSMDMServer) DEPEnrollment() *enrollment.DEPEnrollment {
	return s.depEnroll
}

func (s *IOSMDMServer) StartDEPSync(ctx context.Context) {
	go s.depSyncer.Start(ctx)
}

func (s *IOSMDMServer) Close() {
	if s.depSyncer != nil {
		s.depSyncer.Stop()
	}
	if s.queue != nil {
		s.queue.Close()
	}
}
