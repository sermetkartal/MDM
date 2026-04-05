package main

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/sermetkartal/mdm/services/ios-mdm-service/internal/config"
	"github.com/sermetkartal/mdm/services/ios-mdm-service/internal/server"
	"google.golang.org/grpc"
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

	srv, err := server.NewIOSMDMServer(cfg)
	if err != nil {
		slog.Error("failed to create iOS MDM server", "error", err)
		os.Exit(1)
	}

	// Start gRPC server
	grpcServer := grpc.NewServer()
	srv.RegisterGRPC(grpcServer)
	reflection.Register(grpcServer)

	grpcLis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		slog.Error("failed to listen gRPC", "port", cfg.GRPCPort, "error", err)
		os.Exit(1)
	}

	go func() {
		slog.Info("gRPC server starting", "port", cfg.GRPCPort)
		if err := grpcServer.Serve(grpcLis); err != nil {
			slog.Error("gRPC server failed", "error", err)
			cancel()
		}
	}()

	// Start HTTP server for MDM protocol endpoints
	mux := http.NewServeMux()
	srv.MDMServer().RegisterRoutes(mux)
	srv.ManualEnrollment().RegisterRoutes(mux)
	srv.DEPEnrollment().RegisterRoutes(mux)

	httpServer := &http.Server{
		Addr:    ":" + cfg.HTTPPort,
		Handler: mux,
	}

	go func() {
		slog.Info("HTTP server starting", "port", cfg.HTTPPort)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP server failed", "error", err)
			cancel()
		}
	}()

	// Start DEP syncer
	srv.StartDEPSync(ctx)

	<-ctx.Done()
	slog.Info("shutting down ios-mdm-service...")

	httpServer.Shutdown(context.Background())
	grpcServer.GracefulStop()
	srv.Close()
	slog.Info("ios-mdm-service stopped")
}
