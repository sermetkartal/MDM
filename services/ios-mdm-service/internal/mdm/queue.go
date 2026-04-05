package mdm

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/sermetkartal/mdm/services/ios-mdm-service/internal/model"
)

type Queue struct {
	rdb *redis.Client
}

func NewQueue(redisURL string) (*Queue, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	rdb := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}

	return &Queue{rdb: rdb}, nil
}

func (q *Queue) Close() error {
	return q.rdb.Close()
}

func queueKey(udid string) string {
	return fmt.Sprintf("mdm:commands:%s", udid)
}

type queuedCommand struct {
	CommandUUID string `json:"command_uuid"`
	RequestType string `json:"request_type"`
	Command     []byte `json:"command"`
}

func (q *Queue) Enqueue(ctx context.Context, udid string, requestType string, cmdUUID string, cmdData []byte) error {
	entry := queuedCommand{
		CommandUUID: cmdUUID,
		RequestType: requestType,
		Command:     cmdData,
	}
	data, err := json.Marshal(entry)
	if err != nil {
		return fmt.Errorf("marshal command: %w", err)
	}

	if err := q.rdb.RPush(ctx, queueKey(udid), data).Err(); err != nil {
		return fmt.Errorf("rpush command: %w", err)
	}

	slog.Info("command enqueued", "udid", udid, "command_uuid", cmdUUID, "request_type", requestType)
	return nil
}

func (q *Queue) Dequeue(ctx context.Context, udid string) (*model.MDMCommand, error) {
	data, err := q.rdb.LPop(ctx, queueKey(udid)).Bytes()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, fmt.Errorf("lpop command: %w", err)
	}

	var entry queuedCommand
	if err := json.Unmarshal(data, &entry); err != nil {
		return nil, fmt.Errorf("unmarshal command: %w", err)
	}

	cmdUUID, _ := uuid.Parse(entry.CommandUUID)

	return &model.MDMCommand{
		CommandUUID: cmdUUID,
		DeviceUDID:  udid,
		RequestType: entry.RequestType,
		Command:     entry.Command,
		Status:      model.CommandStatusSent,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}, nil
}

func (q *Queue) QueueLength(ctx context.Context, udid string) (int64, error) {
	return q.rdb.LLen(ctx, queueKey(udid)).Result()
}
