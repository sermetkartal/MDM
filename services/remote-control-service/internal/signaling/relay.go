package signaling

import (
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/remote-control-service/internal/model"
)

// Relay manages WebRTC signaling message relay between admin console and device.
// Messages are relayed through NATS for distributed operation.
type Relay struct {
	nc       *nats.Conn
	mu       sync.RWMutex
	channels map[uuid.UUID]*SessionChannel
}

// SessionChannel holds per-session signaling channels for admin and device sides.
type SessionChannel struct {
	AdminCh  chan model.SignalingMessage
	DeviceCh chan model.SignalingMessage
	sub      *nats.Subscription
}

func NewRelay(nc *nats.Conn) *Relay {
	return &Relay{
		nc:       nc,
		channels: make(map[uuid.UUID]*SessionChannel),
	}
}

// CreateChannel creates signaling channels for a session.
// Returns admin channel (messages TO admin) and device channel (messages TO device).
func (r *Relay) CreateChannel(sessionID uuid.UUID) (adminCh, deviceCh chan model.SignalingMessage) {
	r.mu.Lock()
	defer r.mu.Unlock()

	sc := &SessionChannel{
		AdminCh:  make(chan model.SignalingMessage, 100),
		DeviceCh: make(chan model.SignalingMessage, 100),
	}
	r.channels[sessionID] = sc

	// Subscribe to NATS for this session's signaling messages
	if r.nc != nil {
		subject := "signaling." + sessionID.String()
		sub, err := r.nc.Subscribe(subject, func(msg *nats.Msg) {
			var sigMsg model.SignalingMessage
			if err := json.Unmarshal(msg.Data, &sigMsg); err != nil {
				slog.Error("failed to unmarshal signaling message", "error", err)
				return
			}
			r.routeMessage(sessionID, sigMsg)
		})
		if err != nil {
			slog.Error("failed to subscribe to NATS", "session_id", sessionID, "error", err)
		} else {
			sc.sub = sub
		}
	}

	return sc.AdminCh, sc.DeviceCh
}

// GetAdminChannel returns the admin-facing signaling channel for a session.
func (r *Relay) GetAdminChannel(sessionID uuid.UUID) (chan model.SignalingMessage, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	sc, ok := r.channels[sessionID]
	if !ok {
		return nil, false
	}
	return sc.AdminCh, true
}

// GetDeviceChannel returns the device-facing signaling channel for a session.
func (r *Relay) GetDeviceChannel(sessionID uuid.UUID) (chan model.SignalingMessage, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	sc, ok := r.channels[sessionID]
	if !ok {
		return nil, false
	}
	return sc.DeviceCh, true
}

func (r *Relay) routeMessage(sessionID uuid.UUID, msg model.SignalingMessage) {
	r.mu.RLock()
	sc, ok := r.channels[sessionID]
	r.mu.RUnlock()

	if !ok {
		return
	}

	// Route based on the "to" field
	var ch chan model.SignalingMessage
	switch msg.To {
	case "admin":
		ch = sc.AdminCh
	case "device":
		ch = sc.DeviceCh
	default:
		// Broadcast to the other side based on "from"
		if msg.From == "admin" {
			ch = sc.DeviceCh
		} else {
			ch = sc.AdminCh
		}
	}

	select {
	case ch <- msg:
	default:
		slog.Warn("signaling channel full, dropping message", "session_id", sessionID)
	}
}

// SendMessage relays a signaling message via NATS or in-memory channels.
func (r *Relay) SendMessage(msg model.SignalingMessage) error {
	msg.Timestamp = time.Now()

	if r.nc != nil {
		data, err := json.Marshal(msg)
		if err != nil {
			return err
		}
		subject := "signaling." + msg.SessionID.String()
		return r.nc.Publish(subject, data)
	}

	// Fallback to in-memory routing
	r.routeMessage(msg.SessionID, msg)
	return nil
}

// CloseChannel closes and removes a session's signaling channels.
func (r *Relay) CloseChannel(sessionID uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if sc, ok := r.channels[sessionID]; ok {
		if sc.sub != nil {
			sc.sub.Unsubscribe()
		}
		close(sc.AdminCh)
		close(sc.DeviceCh)
		delete(r.channels, sessionID)
	}
}
