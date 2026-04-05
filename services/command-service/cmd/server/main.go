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
	"github.com/sermetkartal/mdm/services/command-service/internal/config"
	_ "github.com/sermetkartal/mdm/services/command-service/internal/metrics"
	"github.com/sermetkartal/mdm/services/command-service/internal/server"
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

	commandServer, err := server.NewCommandServer(cfg)
	if err != nil {
		slog.Error("failed to create command server", "error", err)
		os.Exit(1)
	}
	commandServer.Register(grpcServer)

	healthServer := health.NewServer()
	grpc_health_v1.RegisterHealthServer(grpcServer, healthServer)
	healthServer.SetServingStatus("command-service", grpc_health_v1.HealthCheckResponse_SERVING)

	reflection.Register(grpcServer)

	lis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		slog.Error("failed to listen", "port", cfg.GRPCPort, "error", err)
		os.Exit(1)
	}

	// Start Prometheus metrics server
	metricsMux := http.NewServeMux()
	metricsMux.Handle("/metrics", promhttp.Handler())
	metricsServer := &http.Server{Addr: ":9091", Handler: metricsMux}
	go func() {
		slog.Info("metrics server starting", "port", "9091")
		if err := metricsServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("metrics server failed", "error", err)
		}
	}()
	go func() {
		<-ctx.Done()
		metricsServer.Close()
	}()

	// Start background workers
	commandServer.StartWorkers(ctx)

	// Start WebSocket server for admin console notifications
	if bridge := commandServer.Bridge(); bridge != nil {
		wsMux := http.NewServeMux()
		wsMux.HandleFunc("/ws/commands", bridge.HandleWebSocket)
		wsServer := &http.Server{Addr: ":8081", Handler: wsMux, ReadHeaderTimeout: 5 * time.Second}
		go func() {
			slog.Info("websocket server starting", "port", "8081")
			if err := wsServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				slog.Error("websocket server failed", "error", err)
			}
		}()
		go func() {
			<-ctx.Done()
			shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer shutCancel()
			wsServer.Shutdown(shutCtx)
		}()
	}

	// Start HTTP health server
	httpHealth := server.NewHealthServer(":"+cfg.HTTPHealthPort, commandServer.DB(), commandServer.NC(), commandServer.RDB())
	httpHealth.Start()

	go func() {
		slog.Info("command-service starting", "port", cfg.GRPCPort)
		if err := grpcServer.Serve(lis); err != nil {
			slog.Error("gRPC server failed", "error", err)
			cancel()
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down command-service...")

	healthServer.SetServingStatus("command-service", grpc_health_v1.HealthCheckResponse_NOT_SERVING)

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
	commandServer.Close()
	slog.Info("command-service stopped")
}
