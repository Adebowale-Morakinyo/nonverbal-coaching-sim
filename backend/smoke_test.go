//go:build smoke

package backend

import (
	"context"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/db"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/llm"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
)

func TestSmokeCreateSessionReturnsUUID(t *testing.T) {
	_, repo := testDatabase(t)
	server := testServer(repo, fakeLLM{})
	defer server.Close()

	response, err := http.Post(server.URL+"/api/sessions", "application/json", strings.NewReader(`{
		"condition": "verbal_only",
		"interview_type": "behavioural"
	}`))
	if err != nil {
		t.Fatalf("post session: %v", err)
	}
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", response.StatusCode)
	}

	payload := decodeResponse[struct {
		ID uuid.UUID `json:"id"`
	}](t, response)
	if payload.ID == uuid.Nil {
		t.Fatal("expected valid UUID")
	}
}

func TestSmokeWebSocketTurnExchange(t *testing.T) {
	_, repo := testDatabase(t)
	server := testServer(repo, fakeLLM{})
	defer server.Close()

	sessionID := createTestSession(t, server.URL, "verbal_only")
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/" + sessionID.String()
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	if err := conn.WriteJSON(map[string]string{"type": "candidate_turn", "content": "I led a team project successfully."}); err != nil {
		t.Fatalf("write websocket message: %v", err)
	}

	var message struct {
		Type      string `json:"type"`
		Content   string `json:"content"`
		TurnIndex int    `json:"turn_index"`
	}
	if err := conn.ReadJSON(&message); err != nil {
		t.Fatalf("read websocket message: %v", err)
	}
	if message.Type != "ai_response" || strings.TrimSpace(message.Content) == "" || message.TurnIndex == 0 {
		t.Fatalf("unexpected websocket response: %+v", message)
	}
}

func TestSmokeLLMClientReturnsNonEmptyString(t *testing.T) {
	_ = godotenv.Load("../.env", ".env")
	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" || apiKey == "your_key_here" {
		t.Skip("OPENROUTER_API_KEY is not configured")
	}

	client := llm.NewOpenRouterClient(apiKey, os.Getenv("OPENROUTER_BASE_URL"), os.Getenv("LLM_MODEL"))
	output, err := client.Complete(context.Background(), "Reply concisely.", []llm.Message{{Role: "user", Content: "Say hello in one sentence"}})
	if err != nil {
		t.Fatalf("llm complete: %v", err)
	}
	if strings.TrimSpace(output) == "" {
		t.Fatal("expected non-empty LLM response")
	}
}

func TestSmokeDatabaseConnectivity(t *testing.T) {
	pool, _ := testDatabase(t)
	repo := db.NewRepository(pool)
	if err := repo.SessionsTableExists(context.Background()); err != nil {
		t.Fatalf("sessions table not queryable: %v", err)
	}
}
