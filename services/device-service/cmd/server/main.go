package main

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/sermetkartal/mdm/services/device-service/internal/config"
	_ "github.com/sermetkartal/mdm/services/device-service/internal/metrics"
	"github.com/sermetkartal/mdm/services/device-service/internal/server"
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

	deviceServer, err := server.NewDeviceServer(cfg)
	if err != nil {
		slog.Error("failed to create device server", "error", err)
		os.Exit(1)
	}
	deviceServer.Register(grpcServer)

	healthServer := health.NewServer()
	grpc_health_v1.RegisterHealthServer(grpcServer, healthServer)
	healthServer.SetServingStatus("device-service", grpc_health_v1.HealthCheckResponse_SERVING)

	reflection.Register(grpcServer)

	lis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		slog.Error("failed to listen", "port", cfg.GRPCPort, "error", err)
		os.Exit(1)
	}

	// Start Prometheus metrics server
	metricsMux := http.NewServeMux()
	metricsMux.Handle("/metrics", promhttp.Handler())
	metricsServer := &http.Server{Addr: ":9090", Handler: metricsMux}
	go func() {
		slog.Info("metrics server starting", "port", "9090")
		if err := metricsServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("metrics server failed", "error", err)
		}
	}()
	go func() {
		<-ctx.Done()
		metricsServer.Close()
	}()

	// Start HTTP health server
	httpHealth := server.NewHealthServer(":"+cfg.HTTPHealthPort, deviceServer.DB(), deviceServer.NC())
	httpHealth.Start()

	go func() {
		slog.Info("device-service starting", "port", cfg.GRPCPort)
		if err := grpcServer.Serve(lis); err != nil {
			slog.Error("gRPC server failed", "error", err)
			cancel()
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down device-service...")

	// Stop accepting new requests
	healthServer.SetServingStatus("device-service", grpc_health_v1.HealthCheckResponse_NOT_SERVING)

	// Drain in-flight requests with timeout
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
	deviceServer.Close()
	slog.Info("device-service stopped")
}
