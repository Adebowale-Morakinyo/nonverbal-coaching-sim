package ws

import (
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type Hub struct {
	sessionID uuid.UUID
	mu        sync.Mutex
	clients   map[*websocket.Conn]struct{}
}

func NewHub(sessionID uuid.UUID) *Hub {
	return &Hub{
		sessionID: sessionID,
		clients:   make(map[*websocket.Conn]struct{}),
	}
}

func (h *Hub) SessionID() uuid.UUID {
	return h.sessionID
}

func (h *Hub) Register(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[conn] = struct{}{}
}

func (h *Hub) Unregister(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, conn)
}

func (h *Hub) Count() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}

type Manager struct {
	mu   sync.Mutex
	hubs map[uuid.UUID]*Hub
}

func NewManager() *Manager {
	return &Manager{hubs: make(map[uuid.UUID]*Hub)}
}

func (m *Manager) HubFor(sessionID uuid.UUID) *Hub {
	m.mu.Lock()
	defer m.mu.Unlock()

	hub, ok := m.hubs[sessionID]
	if !ok {
		hub = NewHub(sessionID)
		m.hubs[sessionID] = hub
	}
	return hub
}
