//go:build integration

package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/session"
	"github.com/gorilla/websocket"
)

func TestIntegrationFullSessionLifecycle(t *testing.T) {
	_, repo := testDatabase(t)
	server := testServer(repo, fakeLLM{})
	defer server.Close()

	sessionID := createTestSession(t, server.URL, "full_multimodal")
	for _, content := range []string{
		"I handled a difficult stakeholder by clarifying their goals.",
		"I measured success through improved delivery time.",
		"I would communicate risks earlier next time.",
		"I kept the team aligned with weekly updates.",
		"The final result was delivered two weeks early.",
	} {
		_ = postJSON[map[string]any](t, server.URL+"/api/sessions/"+sessionID.String()+"/turns", map[string]any{"content": content}, http.StatusOK)
	}

	report := postJSON[session.Report](t, server.URL+"/api/sessions/"+sessionID.String()+"/end", map[string]any{}, http.StatusOK)
	type dimension struct {
		Score   int    `json:"score"`
		Comment string `json:"comment"`
	}
	var verbal struct {
		AnswerStructure      dimension `json:"answer_structure"`
		ReasoningClarity     dimension `json:"reasoning_clarity"`
		UseOfExamples        dimension `json:"use_of_examples"`
		CommunicationQuality dimension `json:"communication_quality"`
		OverallImpression    string    `json:"overall_impression"`
		TopStrengths         []string  `json:"top_strengths"`
		TopImprovements      []string  `json:"top_improvements"`
	}
	if err := json.Unmarshal(report.VerbalAnalysis, &verbal); err != nil {
		t.Fatalf("unmarshal verbal report: %v", err)
	}
	dimensions := map[string]dimension{
		"answer_structure":      verbal.AnswerStructure,
		"reasoning_clarity":     verbal.ReasoningClarity,
		"use_of_examples":       verbal.UseOfExamples,
		"communication_quality": verbal.CommunicationQuality,
	}
	for key, dimension := range dimensions {
		if dimension.Score < 1 || dimension.Score > 5 {
			t.Fatalf("score for %q out of range: %d", key, dimension.Score)
		}
		if dimension.Comment == "" {
			t.Fatalf("missing comment for %q", key)
		}
	}
	if verbal.OverallImpression == "" {
		t.Fatal("missing overall impression")
	}
	if len(verbal.TopStrengths) == 0 {
		t.Fatal("missing top strengths")
	}
	if len(verbal.TopImprovements) == 0 {
		t.Fatal("missing top improvements")
	}
}

func TestIntegrationSnapshotEndpointPersistsSnapshots(t *testing.T) {
	_, repo := testDatabase(t)
	server := testServer(repo, fakeLLM{})
	defer server.Close()

	sessionID := createTestSession(t, server.URL, "full_multimodal")
	for i := 0; i < 5; i++ {
		_ = postJSON[session.FacialSnapshot](t, server.URL+"/api/sessions/"+sessionID.String()+"/snapshot", map[string]any{
			"eye_contact_ratio": 0.7,
			"head_stability":    0.8,
			"facial_activity":   0.6,
		}, http.StatusCreated)
	}

	snapshots, err := repo.ListSnapshots(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("list snapshots: %v", err)
	}
	if len(snapshots) != 5 {
		t.Fatalf("expected 5 snapshots, got %d", len(snapshots))
	}
}

func TestIntegrationWebSocketReconnectSendsLatestAIResponse(t *testing.T) {
	_, repo := testDatabase(t)
	server := testServer(repo, fakeLLM{})
	defer server.Close()

	sessionID := createTestSession(t, server.URL, "verbal_only")
	_ = postJSON[map[string]any](t, server.URL+"/api/sessions/"+sessionID.String()+"/turns", map[string]any{"content": "I used a clear example."}, http.StatusOK)

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/" + sessionID.String()
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, http.Header{"Origin": []string{"http://localhost:5173"}})
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	var message struct {
		Type      string `json:"type"`
		Content   string `json:"content"`
		TurnIndex int    `json:"turn_index"`
	}
	if err := conn.ReadJSON(&message); err != nil {
		t.Fatalf("read websocket message: %v", err)
	}
	if message.Type != "ai_response" {
		t.Fatalf("expected ai_response, got %q", message.Type)
	}
	if message.Content == "" {
		t.Fatal("expected non-empty ai response")
	}
	if message.TurnIndex == 0 {
		t.Fatal("expected turn index")
	}
}

func TestIntegrationVerbalOnlyReportOmitsNonverbalSummary(t *testing.T) {
	_, repo := testDatabase(t)
	server := testServer(repo, fakeLLM{})
	defer server.Close()

	sessionID := createTestSession(t, server.URL, "verbal_only")
	_ = postJSON[map[string]any](t, server.URL+"/api/sessions/"+sessionID.String()+"/turns", map[string]any{"content": "I used the STAR method."}, http.StatusOK)

	report := postJSON[session.Report](t, server.URL+"/api/sessions/"+sessionID.String()+"/end", map[string]any{}, http.StatusOK)
	if len(report.NonverbalSummary) != 0 {
		t.Fatalf("expected no nonverbal summary for verbal_only, got %s", string(report.NonverbalSummary))
	}
}

func postJSON[T any](t *testing.T, url string, payload any, status int) T {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	response, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post json: %v", err)
	}
	if response.StatusCode != status {
		t.Fatalf("expected %d, got %d", status, response.StatusCode)
	}
	return decodeResponse[T](t, response)
}
