package main

import (
	"context"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sermetkartal/mdm/services/geofence-service/internal/config"
	"github.com/sermetkartal/mdm/services/geofence-service/internal/server"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	grpcServer := grpc.NewServer()

	geofenceServer, err := server.NewGeofenceServer(cfg)
	if err != nil {
		slog.Error("failed to create geofence server", "error", err)
		os.Exit(1)
	}
	geofenceServer.Register(grpcServer)

	healthServer := health.NewServer()
	grpc_health_v1.RegisterHealthServer(grpcServer, healthServer)
	healthServer.SetServingStatus("geofence-service", grpc_health_v1.HealthCheckResponse_SERVING)

	reflection.Register(grpcServer)

	lis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		slog.Error("failed to listen", "port", cfg.GRPCPort, "error", err)
		os.Exit(1)
	}

	// Start HTTP health server
	httpHealth := server.NewHealthServer(":"+cfg.HTTPHealthPort, geofenceServer.DB(), geofenceServer.NC())
	httpHealth.Start()

	go func() {
		slog.Info("geofence-service starting", "port", cfg.GRPCPort)
		if err := grpcServer.Serve(lis); err != nil {
			slog.Error("gRPC server failed", "error", err)
			cancel()
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down geofence-service...")
	healthServer.SetServingStatus("geofence-service", grpc_health_v1.HealthCheckResponse_NOT_SERVING)

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	stopped := make(chan struct{})
	go func() {
		grpcServer.GracefulStop()
		close(stopped)
	}()
	select {
	case <-stopped:
		slog.Info("gRPC server drained gracefully")
	case <-shutdownCtx.Done():
		slog.Warn("gRPC graceful stop timed out, forcing")
		grpcServer.Stop()
	}

	httpHealth.Shutdown(shutdownCtx)
	geofenceServer.Close()
	slog.Info("geofence-service stopped")
}
