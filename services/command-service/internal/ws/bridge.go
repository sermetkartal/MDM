package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
)

// Bridge subscribes to NATS "command.status_changed" events, forwards them
// to Redis pub/sub, and serves a WebSocket endpoint for admin clients.
type Bridge struct {
	nc       *nats.Conn
	rdb      *redis.Client
	upgrader websocket.Upgrader

	mu      sync.RWMutex
	clients map[uuid.UUID]map[*websocket.Conn]struct{} // org_id -> set of connections
}

func NewBridge(nc *nats.Conn, rdb *redis.Client) *Bridge {
	return &Bridge{
		nc:  nc,
		rdb: rdb,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		clients: make(map[uuid.UUID]map[*websocket.Conn]struct{}),
	}
}

// Start begins subscribing to NATS events and forwarding to Redis.
func (b *Bridge) Start(ctx context.Context) error {
	// Subscribe to NATS command status changes
	sub, err := b.nc.Subscribe("command.status_changed", func(msg *nats.Msg) {
		var event struct {
			OrgID uuid.UUID `json:"org_id"`
		}
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			slog.Error("failed to unmarshal status event in bridge", "error", err)
			return
		}

		// Forward to Redis pub/sub for the org
		channel := fmt.Sprintf("ws:commands:%s", event.OrgID)
		if err := b.rdb.Publish(ctx, channel, msg.Data).Err(); err != nil {
			slog.Error("failed to publish to Redis", "channel", channel, "error", err)
		}
	})
	if err != nil {
		return fmt.Errorf("failed to subscribe to NATS: %w", err)
	}

	// Start Redis subscriber that pushes to connected WebSocket clients
	go b.redisSubscriber(ctx)

	go func() {
		<-ctx.Done()
		sub.Unsubscribe()
		slog.Info("ws bridge NATS subscription closed")
	}()

	slog.Info("ws bridge started")
	return nil
}

// redisSubscriber listens on Redis pub/sub for all org channels and
// forwards messages to connected WebSocket clients.
func (b *Bridge) redisSubscriber(ctx context.Context) {
	pubsub := b.rdb.PSubscribe(ctx, "ws:commands:*")
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}

			// Extract org_id from channel name "ws:commands:{org_id}"
			var event struct {
				OrgID uuid.UUID `json:"org_id"`
			}
			if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
				continue
			}

			b.broadcastToOrg(event.OrgID, []byte(msg.Payload))
		}
	}
}

// HandleWebSocket upgrades an HTTP connection to WebSocket for an admin client.
// The org_id is expected as a query parameter.
func (b *Bridge) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	orgIDStr := r.URL.Query().Get("org_id")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		http.Error(w, "invalid org_id", http.StatusBadRequest)
		return
	}

	conn, err := b.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("websocket upgrade failed", "error", err)
		return
	}

	b.addClient(orgID, conn)
	slog.Info("websocket client connected", "org_id", orgID)

	// Keep connection alive, remove on close
	defer func() {
		b.removeClient(orgID, conn)
		conn.Close()
		slog.Info("websocket client disconnected", "org_id", orgID)
	}()

	for {
		// Read messages from client (used for keepalive/ping)
		_, _, err := conn.ReadMessage()
		if err != nil {
			return
		}
	}
}

func (b *Bridge) addClient(orgID uuid.UUID, conn *websocket.Conn) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.clients[orgID] == nil {
		b.clients[orgID] = make(map[*websocket.Conn]struct{})
	}
	b.clients[orgID][conn] = struct{}{}
}

func (b *Bridge) removeClient(orgID uuid.UUID, conn *websocket.Conn) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if conns, ok := b.clients[orgID]; ok {
		delete(conns, conn)
		if len(conns) == 0 {
			delete(b.clients, orgID)
		}
	}
}

func (b *Bridge) broadcastToOrg(orgID uuid.UUID, data []byte) {
	b.mu.RLock()
	conns := b.clients[orgID]
	b.mu.RUnlock()

	for conn := range conns {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			slog.Error("failed to write to websocket", "org_id", orgID, "error", err)
			b.removeClient(orgID, conn)
			conn.Close()
		}
	}
}
