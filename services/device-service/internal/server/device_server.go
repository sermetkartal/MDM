package server

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/device-service/internal/config"
	"github.com/sermetkartal/mdm/services/device-service/internal/handler"
	"github.com/sermetkartal/mdm/services/device-service/internal/model"
	"github.com/sermetkartal/mdm/services/device-service/internal/repository"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type DeviceServer struct {
	cfg              *config.Config
	db               *sql.DB
	nc               *nats.Conn
	repo             *repository.DeviceRepository
	handler          *handler.DeviceHandler
	telemetryHandler *handler.TelemetryHandler
}

func NewDeviceServer(cfg *config.Config) (*DeviceServer, error) {
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

	repo := repository.NewDeviceRepository(db)
	h := handler.NewDeviceHandler(repo, nc, db)
	telemetryHandler := handler.NewTelemetryHandler(db, nc)

	return &DeviceServer{
		cfg:              cfg,
		db:               db,
		nc:               nc,
		repo:             repo,
		handler:          h,
		telemetryHandler: telemetryHandler,
	}, nil
}

func (s *DeviceServer) Register(grpcServer *grpc.Server) {
	s.handler.RegisterGRPC(grpcServer)
}

// DB returns the database connection for health checks.
func (s *DeviceServer) DB() *sql.DB { return s.db }

// NC returns the NATS connection for health checks.
func (s *DeviceServer) NC() *nats.Conn { return s.nc }

func (s *DeviceServer) Close() {
	if s.nc != nil {
		s.nc.Close()
	}
	if s.db != nil {
		s.db.Close()
	}
}

// Enroll handles device enrollment
func (s *DeviceServer) Enroll(ctx context.Context, req *model.EnrollRequest) (*model.Device, error) {
	now := time.Now()
	device := &model.Device{
		OrgID:            uuid.New(), // TODO: resolve from enrollment token
		SerialNumber:     req.SerialNumber,
		HardwareID:       req.HardwareID,
		Model:            req.Model,
		Manufacturer:     req.Manufacturer,
		OSType:           "android",
		OSVersion:        req.OSVersion,
		AgentVersion:     req.AgentVersion,
		EnrollmentStatus: model.EnrollmentStatusEnrolled,
		ComplianceState:  model.ComplianceStatePending,
		EnrolledAt:       &now,
	}

	if err := s.repo.Create(ctx, device); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create device: %v", err)
	}

	// Publish enrollment event
	if s.nc != nil {
		s.nc.Publish("device.enrolled", []byte(device.ID.String()))
	}

	slog.Info("device enrolled", "device_id", device.ID, "serial", device.SerialNumber)
	return device, nil
}

// IngestTelemetry handles incoming telemetry batches from device agents.
func (s *DeviceServer) IngestTelemetry(ctx context.Context, batch *handler.TelemetryBatch) error {
	return s.telemetryHandler.IngestBatch(ctx, batch)
}
