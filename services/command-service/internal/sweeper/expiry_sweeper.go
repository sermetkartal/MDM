package sweeper

import (
	"context"
	"log/slog"
	"time"

	"github.com/sermetkartal/mdm/services/command-service/internal/model"
	"github.com/sermetkartal/mdm/services/command-service/internal/queue"
	"github.com/sermetkartal/mdm/services/command-service/internal/repository"
)

// ExpirySweeper periodically checks for commands that have passed their
// expiration time and marks them as expired.
type ExpirySweeper struct {
	repo     *repository.CommandRepository
	queue    *queue.NATSQueue
	interval time.Duration
}

func NewExpirySweeper(repo *repository.CommandRepository, q *queue.NATSQueue, interval time.Duration) *ExpirySweeper {
	return &ExpirySweeper{repo: repo, queue: q, interval: interval}
}

func (s *ExpirySweeper) Start(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(s.interval)
		defer ticker.Stop()

		slog.Info("expiry sweeper started", "interval", s.interval)

		for {
			select {
			case <-ctx.Done():
				slog.Info("expiry sweeper stopped")
				return
			case <-ticker.C:
				s.sweep(ctx)
			}
		}
	}()
}

func (s *ExpirySweeper) sweep(ctx context.Context) {
	expired, err := s.repo.GetExpiredPending(ctx)
	if err != nil {
		slog.Error("failed to fetch expired commands", "error", err)
		return
	}

	for _, cmd := range expired {
		if err := s.repo.UpdateStatus(ctx, cmd.ID, model.CommandStatusExpired, "command expired"); err != nil {
			slog.Error("failed to expire command", "command_id", cmd.ID, "error", err)
			continue
		}

		cmd.Status = model.CommandStatusExpired

		// Publish status change event
		if s.queue != nil {
			if err := s.queue.PublishStatusChanged(ctx, cmd); err != nil {
				slog.Error("failed to publish expiry event", "command_id", cmd.ID, "error", err)
			}
		}

		slog.Info("command expired", "command_id", cmd.ID, "device_id", cmd.DeviceID)
	}

	if len(expired) > 0 {
		slog.Info("expiry sweep completed", "expired_count", len(expired))
	}
}
