package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/api"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/db"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/llm"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/ws"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	ctx := context.Background()
	pool, err := db.NewPool(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		logger.Error("database connection failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer pool.Close()

	repository := db.NewRepository(pool)
	llmClient := llm.NewOpenRouterClient(
		os.Getenv("OPENROUTER_API_KEY"),
		getenv("OPENROUTER_BASE_URL", llm.DefaultBaseURL),
		getenv("LLM_MODEL", llm.DefaultModel),
	)

	addr := ":" + getenv("PORT", "8080")
	server := &http.Server{
		Addr: addr,
		Handler: api.NewRouter(api.Config{
			Repository:     repository,
			LLM:            llmClient,
			Hubs:           ws.NewManager(),
			Logger:         logger,
			AllowedOrigins: splitCSV(os.Getenv("ALLOWED_ORIGINS")),
		}),
		ReadHeaderTimeout: 5 * time.Second,
	}

	logger.Info("server listening", slog.String("addr", addr))
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Error("server failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func splitCSV(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	parts := strings.Split(value, ",")
	output := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			output = append(output, trimmed)
		}
	}
	return output
}
