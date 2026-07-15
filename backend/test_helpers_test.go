package backend

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/api"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/db"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/llm"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/session"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/ws"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

type fakeLLM struct{}

func (fakeLLM) InterviewResponse(_ context.Context, _ session.InterviewType, turns []session.Turn) (string, error) {
	return "Thank you. Could you share one specific example?", nil
}

func (fakeLLM) VerbalReport(context.Context, session.InterviewType, []session.Turn) (json.RawMessage, error) {
	return json.RawMessage(`{
		"answer_structure": {"score": 4, "comment": "Clear structure with room for sharper endings."},
		"reasoning_clarity": {"score": 4, "comment": "Reasoning was easy to follow."},
		"use_of_examples": {"score": 3, "comment": "Examples were relevant but could include more measurable detail."},
		"communication_quality": {"score": 4, "comment": "Concise and professional."},
		"overall_impression": "A credible interview performance.",
		"top_strengths": ["Clear communication", "Relevant experience"],
		"top_improvements": ["Add metrics", "Tighten conclusions"]
	}`), nil
}

func (fakeLLM) Complete(context.Context, string, []llm.Message) (string, error) {
	return "Hello from the test interviewer.", nil
}

func testDatabase(t *testing.T) (*pgxpool.Pool, *db.Repository) {
	t.Helper()
	_ = godotenv.Load()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is not set")
	}

	ctx := context.Background()
	pool, err := db.NewPool(ctx, databaseURL)
	if err != nil {
		t.Skipf("database is unavailable: %v", err)
	}

	if err := db.RunMigrations(ctx, pool, "migrations"); err != nil {
		pool.Close()
		t.Fatalf("run migrations: %v", err)
	}
	truncateDatabase(t, pool)

	t.Cleanup(pool.Close)
	return pool, db.NewRepository(pool)
}

func truncateDatabase(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		TRUNCATE reports, facial_snapshots, turns, sessions RESTART IDENTITY CASCADE
	`)
	if err != nil {
		t.Fatalf("truncate database: %v", err)
	}
}

func testServer(repo api.Repository, model llm.Client) *httptest.Server {
	return httptest.NewServer(api.NewRouter(api.Config{
		Repository:     repo,
		LLM:            model,
		Hubs:           ws.NewManager(),
		AllowedOrigins: []string{"http://localhost:5173"},
	}))
}

func decodeResponse[T any](t *testing.T, response *http.Response) T {
	t.Helper()
	defer response.Body.Close()
	var output T
	if err := json.NewDecoder(response.Body).Decode(&output); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return output
}

func createTestSession(t *testing.T, serverURL string, condition string) uuid.UUID {
	t.Helper()
	body := `{"condition":"` + condition + `","interview_type":"behavioural"}`
	response, err := http.Post(serverURL+"/api/sessions", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("create session request: %v", err)
	}
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", response.StatusCode)
	}
	payload := decodeResponse[struct {
		ID uuid.UUID `json:"id"`
	}](t, response)
	if payload.ID == uuid.Nil {
		t.Fatal("expected non-empty session id")
	}
	return payload.ID
}
