//go:build integration

package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/session"
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
	} {
		_ = postJSON[map[string]any](t, server.URL+"/api/sessions/"+sessionID.String()+"/turns", map[string]any{"content": content}, http.StatusOK)
	}

	report := postJSON[session.Report](t, server.URL+"/api/sessions/"+sessionID.String()+"/end", map[string]any{}, http.StatusOK)
	var verbal map[string]any
	if err := json.Unmarshal(report.VerbalAnalysis, &verbal); err != nil {
		t.Fatalf("unmarshal verbal report: %v", err)
	}
	for _, key := range []string{"answer_structure", "reasoning_clarity", "use_of_examples", "communication_quality"} {
		if _, ok := verbal[key]; !ok {
			t.Fatalf("missing verbal dimension %q", key)
		}
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
