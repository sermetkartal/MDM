package resilience

import (
	"errors"
	"log/slog"
	"sync"
	"time"
)

// State represents the circuit breaker state.
type State int

const (
	StateClosed   State = iota // Normal operation
	StateOpen                  // Failing fast
	StateHalfOpen              // Probing
)

func (s State) String() string {
	switch s {
	case StateClosed:
		return "closed"
	case StateOpen:
		return "open"
	case StateHalfOpen:
		return "half-open"
	default:
		return "unknown"
	}
}

var (
	ErrCircuitOpen = errors.New("circuit breaker is open")
)

// CircuitBreaker implements a simple circuit breaker pattern.
type CircuitBreaker struct {
	name             string
	mu               sync.Mutex
	state            State
	failureCount     int
	successCount     int
	failureThreshold int
	resetTimeout     time.Duration
	halfOpenMaxCalls int
	lastFailure      time.Time
	halfOpenCalls    int
}

// Config holds circuit breaker configuration.
type Config struct {
	Name             string
	FailureThreshold int
	ResetTimeout     time.Duration
	HalfOpenMaxCalls int
}

// DefaultConfig returns sensible defaults.
func DefaultConfig(name string) Config {
	return Config{
		Name:             name,
		FailureThreshold: 5,
		ResetTimeout:     30 * time.Second,
		HalfOpenMaxCalls: 3,
	}
}

// New creates a new circuit breaker with the given config.
func New(cfg Config) *CircuitBreaker {
	return &CircuitBreaker{
		name:             cfg.Name,
		state:            StateClosed,
		failureThreshold: cfg.FailureThreshold,
		resetTimeout:     cfg.ResetTimeout,
		halfOpenMaxCalls: cfg.HalfOpenMaxCalls,
	}
}

// Execute runs the given function through the circuit breaker.
// If the circuit is open, it returns ErrCircuitOpen immediately.
// If the circuit is half-open, it allows a limited number of probe calls.
func (cb *CircuitBreaker) Execute(fn func() error) error {
	if err := cb.beforeCall(); err != nil {
		return err
	}

	err := fn()
	cb.afterCall(err)
	return err
}

// State returns the current circuit breaker state.
func (cb *CircuitBreaker) State() State {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	return cb.currentState()
}

func (cb *CircuitBreaker) beforeCall() error {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	state := cb.currentState()
	switch state {
	case StateClosed:
		return nil
	case StateOpen:
		return ErrCircuitOpen
	case StateHalfOpen:
		if cb.halfOpenCalls >= cb.halfOpenMaxCalls {
			return ErrCircuitOpen
		}
		cb.halfOpenCalls++
		return nil
	}
	return nil
}

func (cb *CircuitBreaker) afterCall(err error) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	state := cb.currentState()

	if err != nil {
		cb.failureCount++
		cb.lastFailure = time.Now()

		switch state {
		case StateClosed:
			if cb.failureCount >= cb.failureThreshold {
				cb.toOpen()
			}
		case StateHalfOpen:
			cb.toOpen()
		}
	} else {
		switch state {
		case StateClosed:
			cb.failureCount = 0
		case StateHalfOpen:
			cb.successCount++
			if cb.successCount >= cb.halfOpenMaxCalls {
				cb.toClosed()
			}
		}
	}
}

// currentState evaluates the actual state, considering timeout transitions.
// Must be called with lock held.
func (cb *CircuitBreaker) currentState() State {
	if cb.state == StateOpen {
		if time.Since(cb.lastFailure) >= cb.resetTimeout {
			cb.state = StateHalfOpen
			cb.halfOpenCalls = 0
			cb.successCount = 0
			slog.Warn("circuit breaker transitioning to half-open", "name", cb.name)
		}
	}
	return cb.state
}

func (cb *CircuitBreaker) toOpen() {
	cb.state = StateOpen
	cb.halfOpenCalls = 0
	cb.successCount = 0
	slog.Warn("circuit breaker opened", "name", cb.name, "failures", cb.failureCount)
}

func (cb *CircuitBreaker) toClosed() {
	cb.state = StateClosed
	cb.failureCount = 0
	cb.successCount = 0
	cb.halfOpenCalls = 0
	slog.Info("circuit breaker closed", "name", cb.name)
}
