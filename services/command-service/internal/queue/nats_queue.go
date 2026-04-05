package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/sermetkartal/mdm/services/command-service/internal/model"
)

const (
	StreamName   = "COMMANDS"
	SubjectBase  = "commands"
	ConsumerName = "command-processor"
)

type NATSQueue struct {
	nc     *nats.Conn
	js     jetstream.JetStream
	stream jetstream.Stream
}

func NewNATSQueue(nc *nats.Conn) (*NATSQueue, error) {
	js, err := jetstream.New(nc)
	if err != nil {
		return nil, fmt.Errorf("failed to create JetStream context: %w", err)
	}

	stream, err := js.CreateOrUpdateStream(context.Background(), jetstream.StreamConfig{
		Name:     StreamName,
		Subjects: []string{SubjectBase + ".>"},
		Storage:  jetstream.FileStorage,
		MaxAge:   0, // no max age, commands expire via application logic
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create stream: %w", err)
	}

	slog.Info("JetStream stream ready", "stream", StreamName)

	return &NATSQueue{nc: nc, js: js, stream: stream}, nil
}

// Publish enqueues a command for delivery.
// Subject format: commands.{org_id}.{device_id}.{command_type}
func (q *NATSQueue) Publish(ctx context.Context, cmd *model.Command) error {
	subject := fmt.Sprintf("%s.%s.%s.%s", SubjectBase, cmd.OrgID.String(), cmd.DeviceID.String(), cmd.CommandType)

	data, err := json.Marshal(cmd)
	if err != nil {
		return fmt.Errorf("failed to marshal command: %w", err)
	}

	_, err = q.js.Publish(ctx, subject, data)
	if err != nil {
		return fmt.Errorf("failed to publish command: %w", err)
	}

	slog.Info("command published", "command_id", cmd.ID, "device_id", cmd.DeviceID, "type", cmd.CommandType)
	return nil
}

// PublishStatusChanged publishes a command status change event on NATS.
func (q *NATSQueue) PublishStatusChanged(ctx context.Context, cmd *model.Command) error {
	data, err := json.Marshal(map[string]interface{}{
		"command_id":   cmd.ID,
		"device_id":    cmd.DeviceID,
		"org_id":       cmd.OrgID,
		"command_type": cmd.CommandType,
		"status":       cmd.Status,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal status event: %w", err)
	}

	if err := q.nc.Publish("command.status_changed", data); err != nil {
		return fmt.Errorf("failed to publish status changed: %w", err)
	}
	return nil
}

// PublishFailed publishes a command failure event.
func (q *NATSQueue) PublishFailed(ctx context.Context, cmd *model.Command, reason string) error {
	data, err := json.Marshal(map[string]interface{}{
		"command_id":   cmd.ID,
		"device_id":    cmd.DeviceID,
		"org_id":       cmd.OrgID,
		"command_type": cmd.CommandType,
		"reason":       reason,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal failure event: %w", err)
	}

	if err := q.nc.Publish("command.failed", data); err != nil {
		return fmt.Errorf("failed to publish command failed: %w", err)
	}
	return nil
}

// Subscribe creates a durable consumer for processing commands with ack-wait 30s.
func (q *NATSQueue) Subscribe(ctx context.Context, handler func(cmd *model.Command, ack func() error) error) error {
	consumer, err := q.stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:   ConsumerName,
		AckPolicy: jetstream.AckExplicitPolicy,
		AckWait:   30 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("failed to create consumer: %w", err)
	}

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			msgs, err := consumer.Fetch(10, jetstream.FetchMaxWait(5_000_000_000)) // 5s
			if err != nil {
				continue
			}

			for msg := range msgs.Messages() {
				var cmd model.Command
				if err := json.Unmarshal(msg.Data(), &cmd); err != nil {
					slog.Error("failed to unmarshal command", "error", err)
					msg.Nak()
					continue
				}

				if err := handler(&cmd, func() error { return msg.Ack() }); err != nil {
					slog.Error("failed to handle command", "command_id", cmd.ID, "error", err)
					msg.Nak()
				}
			}
		}
	}()

	slog.Info("command queue subscriber started", "consumer", ConsumerName)
	return nil
}

func (q *NATSQueue) Close() {
	// NATS connection is closed by the server
}
