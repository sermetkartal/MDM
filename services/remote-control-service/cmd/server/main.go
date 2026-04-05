package main

import (
	"context"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sermetkartal/mdm/services/remote-control-service/internal/config"
	"github.com/sermetkartal/mdm/services/remote-control-service/internal/server"
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

	remoteServer, err := server.NewRemoteControlServer(cfg)
	if err != nil {
		slog.Error("failed to create remote-control server", "error", err)
		os.Exit(1)
	}
	remoteServer.Register(grpcServer)

	healthServer := health.NewServer()
	grpc_health_v1.RegisterHealthServer(grpcServer, healthServer)
	healthServer.SetServingStatus("remote-control-service", grpc_health_v1.HealthCheckResponse_SERVING)

	reflection.Register(grpcServer)

	lis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		slog.Error("failed to listen", "port", cfg.GRPCPort, "error", err)
		os.Exit(1)
	}

	// Start HTTP health server
	httpHealth := server.NewHealthServer(":"+cfg.HTTPHealthPort, nil, remoteServer.NC())
	httpHealth.Start()

	// Start session cleanup loop
	remoteServer.StartCleanupLoop(ctx)

	// Start HTTP server for REST + WebSocket
	go func() {
		if err := remoteServer.StartHTTP(); err != nil {
			slog.Error("HTTP server failed", "error", err)
			cancel()
		}
	}()

	// Start gRPC server
	go func() {
		slog.Info("remote-control-service starting", "grpc_port", cfg.GRPCPort, "http_port", cfg.HTTPPort)
		if err := grpcServer.Serve(lis); err != nil {
			slog.Error("gRPC server failed", "error", err)
			cancel()
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down remote-control-service...")
	healthServer.SetServingStatus("remote-control-service", grpc_health_v1.HealthCheckResponse_NOT_SERVING)

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
	remoteServer.Close()
	slog.Info("remote-control-service stopped")
}
