package ws

import "sync"

type Hub struct {
	mu      sync.RWMutex
	clients map[string]struct{}
}

func NewHub() *Hub {
	return &Hub{clients: make(map[string]struct{})}
}

func (h *Hub) Register(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[id] = struct{}{}
}

func (h *Hub) Unregister(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, id)
}

func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
