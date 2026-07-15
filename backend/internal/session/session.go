package session

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

type State string

const (
	StateCreated State = "created"
	StateActive  State = "active"
	StateEnded   State = "ended"
)

type Session struct {
	ID        string    `json:"id"`
	Scenario  string    `json:"scenario"`
	State     State     `json:"state"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Store struct {
	mu       sync.RWMutex
	sessions map[string]Session
}

func NewStore() *Store {
	return &Store{sessions: make(map[string]Session)}
}

func (s *Store) Create(scenario string) Session {
	now := time.Now().UTC()
	session := Session{
		ID:        newID(),
		Scenario:  scenario,
		State:     StateCreated,
		CreatedAt: now,
		UpdatedAt: now,
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[session.ID] = session

	return session
}

func (s *Store) Get(id string) (Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	session, ok := s.sessions[id]
	return session, ok
}

func newID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return hex.EncodeToString([]byte(time.Now().UTC().Format(time.RFC3339Nano)))
	}
	return hex.EncodeToString(bytes[:])
}
