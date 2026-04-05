package repository

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/remote-control-service/internal/model"
)

// SessionRepository provides in-memory session storage with TTL support.
// For production, this should be backed by Redis.
type SessionRepository struct {
	mu       sync.RWMutex
	sessions map[uuid.UUID]*model.Session
}

func NewSessionRepository() *SessionRepository {
	return &SessionRepository{
		sessions: make(map[uuid.UUID]*model.Session),
	}
}

func (r *SessionRepository) Create(session *model.Session) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	session.ID = uuid.New()
	session.CreatedAt = time.Now()
	session.LastActivity = time.Now()
	session.State = model.SessionStateCreated
	if session.Quality == "" {
		session.Quality = model.QualityMedium
	}
	r.sessions[session.ID] = session
	return nil
}

func (r *SessionRepository) GetByID(id uuid.UUID) (*model.Session, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	session, ok := r.sessions[id]
	if !ok {
		return nil, fmt.Errorf("session not found: %s", id)
	}
	return session, nil
}

func (r *SessionRepository) UpdateState(id uuid.UUID, state model.SessionState) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	session, ok := r.sessions[id]
	if !ok {
		return fmt.Errorf("session not found: %s", id)
	}
	session.State = state
	session.LastActivity = time.Now()
	if state == model.SessionStateEnded {
		now := time.Now()
		session.EndedAt = &now
	}
	return nil
}

func (r *SessionRepository) UpdateQuality(id uuid.UUID, quality model.QualityPreset) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	session, ok := r.sessions[id]
	if !ok {
		return fmt.Errorf("session not found: %s", id)
	}
	session.Quality = quality
	session.LastActivity = time.Now()
	return nil
}

func (r *SessionRepository) TouchActivity(id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	session, ok := r.sessions[id]
	if !ok {
		return fmt.Errorf("session not found: %s", id)
	}
	session.LastActivity = time.Now()
	return nil
}

func (r *SessionRepository) ListActiveByDevice(deviceID uuid.UUID) ([]*model.Session, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var sessions []*model.Session
	for _, s := range r.sessions {
		if s.DeviceID == deviceID && s.State != model.SessionStateEnded {
			sessions = append(sessions, s)
		}
	}
	return sessions, nil
}

func (r *SessionRepository) HasActiveSession(deviceID uuid.UUID) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, s := range r.sessions {
		if s.DeviceID == deviceID && s.State != model.SessionStateEnded {
			return true
		}
	}
	return false
}

func (r *SessionRepository) Delete(id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.sessions, id)
	return nil
}

// CleanupExpired removes sessions that have been inactive longer than maxAge.
func (r *SessionRepository) CleanupExpired(maxAge time.Duration) int {
	r.mu.Lock()
	defer r.mu.Unlock()

	cutoff := time.Now().Add(-maxAge)
	count := 0
	for id, s := range r.sessions {
		if s.LastActivity.Before(cutoff) || (s.State == model.SessionStateEnded && s.CreatedAt.Before(cutoff)) {
			delete(r.sessions, id)
			count++
		}
	}
	return count
}

// GetExpiredActive returns active sessions that have been inactive longer than maxAge.
func (r *SessionRepository) GetExpiredActive(maxAge time.Duration) []uuid.UUID {
	r.mu.RLock()
	defer r.mu.RUnlock()

	cutoff := time.Now().Add(-maxAge)
	var ids []uuid.UUID
	for _, s := range r.sessions {
		if s.State != model.SessionStateEnded && s.LastActivity.Before(cutoff) {
			ids = append(ids, s.ID)
		}
	}
	return ids
}
