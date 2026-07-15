package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/session"
)

const (
	DefaultBaseURL = "https://openrouter.ai/api/v1"
	DefaultModel   = "anthropic/claude-sonnet-4-5"
)

type Client interface {
	InterviewResponse(ctx context.Context, interviewType session.InterviewType, turns []session.Turn) (string, error)
	VerbalReport(ctx context.Context, interviewType session.InterviewType, turns []session.Turn) (json.RawMessage, error)
	Complete(ctx context.Context, systemPrompt string, messages []Message) (string, error)
}

type OpenRouterClient struct {
	apiKey     string
	baseURL    string
	model      string
	httpClient *http.Client
}

func NewOpenRouterClient(apiKey, baseURL, model string) *OpenRouterClient {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	if model == "" {
		model = DefaultModel
	}
	return &OpenRouterClient{
		apiKey:     apiKey,
		baseURL:    strings.TrimRight(baseURL, "/"),
		model:      model,
		httpClient: &http.Client{Timeout: 45 * time.Second},
	}
}

func (c *OpenRouterClient) InterviewResponse(ctx context.Context, interviewType session.InterviewType, turns []session.Turn) (string, error) {
	return c.Complete(ctx, session.BuildSystemPrompt(string(interviewType)), turnsToMessages(turns))
}

func (c *OpenRouterClient) VerbalReport(ctx context.Context, interviewType session.InterviewType, turns []session.Turn) (json.RawMessage, error) {
	content, err := c.Complete(ctx, session.BuildReportPrompt(string(interviewType)), turnsToMessages(turns))
	if err != nil {
		return nil, err
	}

	var raw json.RawMessage
	if err := json.Unmarshal([]byte(content), &raw); err != nil {
		return nil, fmt.Errorf("llm returned invalid report JSON: %w", err)
	}
	return raw, nil
}

func (c *OpenRouterClient) Complete(ctx context.Context, systemPrompt string, messages []Message) (string, error) {
	if c.apiKey == "" {
		return "", errors.New("OPENROUTER_API_KEY is required")
	}

	requestMessages := append([]Message{{Role: "system", Content: systemPrompt}}, messages...)
	body, err := json.Marshal(chatRequest{
		Model:    c.model,
		Messages: requestMessages,
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", "http://localhost")
	req.Header.Set("X-Title", "The Nonverbal Coaching Simulator")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return "", fmt.Errorf("openrouter request failed: %s: %s", resp.Status, strings.TrimSpace(string(responseBody)))
	}

	var output chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&output); err != nil {
		return "", err
	}
	if len(output.Choices) == 0 || strings.TrimSpace(output.Choices[0].Message.Content) == "" {
		return "", errors.New("openrouter returned an empty response")
	}
	return strings.TrimSpace(output.Choices[0].Message.Content), nil
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
}

type chatResponse struct {
	ID      string `json:"id"`
	Choices []struct {
		Message Message `json:"message"`
	} `json:"choices"`
}

func turnsToMessages(turns []session.Turn) []Message {
	messages := make([]Message, 0, len(turns))
	for _, turn := range turns {
		role := "assistant"
		if turn.Role == session.RoleCandidate {
			role = "user"
		}
		messages = append(messages, Message{Role: role, Content: turn.Content})
	}
	return messages
}
