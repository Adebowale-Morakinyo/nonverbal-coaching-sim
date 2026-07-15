package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/llm"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/session"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/ws"
)

type Router struct {
	mux      *http.ServeMux
	sessions *session.Store
	llm      *llm.OpenRouterClient
	hub      *ws.Hub
}

func NewRouter(sessions *session.Store, llmClient *llm.OpenRouterClient, hub *ws.Hub) http.Handler {
	router := &Router{
		mux:      http.NewServeMux(),
		sessions: sessions,
		llm:      llmClient,
		hub:      hub,
	}

	router.routes()
	return router.withCORS(router.mux)
}

func (r *Router) routes() {
	r.mux.HandleFunc("GET /healthz", r.health)
	r.mux.HandleFunc("POST /api/sessions", r.createSession)
	r.mux.HandleFunc("GET /api/sessions/{id}", r.getSession)
	r.mux.HandleFunc("GET /ws", r.websocketPlaceholder)
}

func (r *Router) health(w http.ResponseWriter, req *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (r *Router) createSession(w http.ResponseWriter, req *http.Request) {
	var input struct {
		Scenario string `json:"scenario"`
	}
	if err := json.NewDecoder(req.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(input.Scenario) == "" {
		writeError(w, http.StatusBadRequest, "scenario is required")
		return
	}

	created := r.sessions.Create(input.Scenario)
	writeJSON(w, http.StatusCreated, created)
}

func (r *Router) getSession(w http.ResponseWriter, req *http.Request) {
	found, ok := r.sessions.Get(req.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	writeJSON(w, http.StatusOK, found)
}

func (r *Router) websocketPlaceholder(w http.ResponseWriter, req *http.Request) {
	writeError(w, http.StatusNotImplemented, "websocket endpoint is not wired yet")
}

func (r *Router) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if req.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, req)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
