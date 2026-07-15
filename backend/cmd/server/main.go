package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/api"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/llm"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/session"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/ws"
)

func main() {
	addr := ":" + getenv("PORT", "8080")

	sessionStore := session.NewStore()
	openRouter := llm.NewOpenRouterClient(os.Getenv("OPENROUTER_API_KEY"), getenv("OPENROUTER_BASE_URL", llm.DefaultBaseURL))
	hub := ws.NewHub()

	server := &http.Server{
		Addr:              addr,
		Handler:           api.NewRouter(sessionStore, openRouter, hub),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("server listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server failed: %v", err)
	}
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
