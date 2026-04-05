package dep

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// DeviceHandler is called for each new/updated device found during sync.
type DeviceHandler func(ctx context.Context, serialNumber, model, os string)

type Syncer struct {
	client   *Client
	interval time.Duration
	handler  DeviceHandler
	cursor   string
	mu       sync.Mutex
	stopCh   chan struct{}
}

func NewSyncer(client *Client, interval time.Duration, handler DeviceHandler) *Syncer {
	return &Syncer{
		client:   client,
		interval: interval,
		handler:  handler,
		stopCh:   make(chan struct{}),
	}
}

func (s *Syncer) Start(ctx context.Context) {
	slog.Info("starting DEP syncer", "interval", s.interval)

	// Run initial sync immediately
	s.sync(ctx)

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.sync(ctx)
		case <-s.stopCh:
			slog.Info("DEP syncer stopped")
			return
		case <-ctx.Done():
			slog.Info("DEP syncer context cancelled")
			return
		}
	}
}

func (s *Syncer) Stop() {
	close(s.stopCh)
}

func (s *Syncer) sync(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()

	resp, err := s.client.SyncDevices(ctx, s.cursor)
	if err != nil {
		slog.Error("DEP sync failed", "error", err)
		return
	}

	for _, device := range resp.Devices {
		if s.handler != nil {
			s.handler(ctx, device.SerialNumber, device.Model, device.OS)
		}
	}

	if resp.Cursor != "" {
		s.cursor = resp.Cursor
	}

	slog.Info("DEP sync completed", "devices_found", len(resp.Devices), "more_to_follow", resp.MoreToFollow)

	// If more devices, sync again immediately
	if resp.MoreToFollow {
		s.sync(ctx)
	}
}
