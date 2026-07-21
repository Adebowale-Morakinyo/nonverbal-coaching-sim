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
	DefaultModel   = "anthropic/claude-sonnet-4.5"
)

type Client interface {
	InterviewResponse(ctx context.Context, interviewType session.InterviewType, turns []session.Turn) (string, error)
	VerbalReport(ctx context.Context, interviewType session.InterviewType, turns []session.Turn) (json.RawMessage, error)
	Complete(ctx context.Context, systemPrompt string, messages []Message) (string, error)
}

type OpenRouterClient struct {
	apiKey      string
	baseURL     string
	model       string
	reportModel string
	httpClient  *http.Client
}

func NewOpenRouterClient(apiKey, baseURL, model string) *OpenRouterClient {
	return NewOpenRouterClientWithReportModel(apiKey, baseURL, model, "")
}

func NewOpenRouterClientWithReportModel(apiKey, baseURL, model, reportModel string) *OpenRouterClient {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	if model == "" {
		model = DefaultModel
	}
	if reportModel == "" {
		reportModel = model
	}
	return &OpenRouterClient{
		apiKey:      apiKey,
		baseURL:     strings.TrimRight(baseURL, "/"),
		model:       model,
		reportModel: reportModel,
		httpClient:  &http.Client{Timeout: 45 * time.Second},
	}
}

func (c *OpenRouterClient) InterviewResponse(ctx context.Context, interviewType session.InterviewType, turns []session.Turn) (string, error) {
	return c.Complete(ctx, session.BuildSystemPrompt(string(interviewType)), turnsToMessages(turns))
}

func (c *OpenRouterClient) VerbalReport(ctx context.Context, interviewType session.InterviewType, turns []session.Turn) (json.RawMessage, error) {
	content, err := c.completeReport(ctx, session.BuildReportPrompt(string(interviewType)), turnsToMessages(turns))
	if err != nil {
		return nil, err
	}

	raw, err := parseReportJSON(content)
	if err == nil {
		return raw, nil
	}

	repaired, repairErr := c.completeReport(ctx, buildReportRepairPrompt(), []Message{
		{Role: "user", Content: content},
	})
	if repairErr != nil {
		return nil, fmt.Errorf("llm returned invalid report JSON: %w; repair failed: %v", err, repairErr)
	}
	raw, repairErr = parseReportJSON(repaired)
	if repairErr != nil {
		return nil, fmt.Errorf("llm returned invalid report JSON: %w; repair returned invalid JSON: %v", err, repairErr)
	}
	return raw, nil
}

func (c *OpenRouterClient) Complete(ctx context.Context, systemPrompt string, messages []Message) (string, error) {
	return c.completeWithModel(ctx, c.model, systemPrompt, messages, nil)
}

func (c *OpenRouterClient) completeReport(ctx context.Context, systemPrompt string, messages []Message) (string, error) {
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		content, err := c.completeWithModel(ctx, c.reportModel, systemPrompt, messages, jsonObjectResponseFormat())
		if err == nil {
			return content, nil
		}
		lastErr = err
		if !errors.Is(err, errEmptyResponse) {
			break
		}
	}
	return "", lastErr
}

func (c *OpenRouterClient) completeWithModel(ctx context.Context, model, systemPrompt string, messages []Message, responseFormat any) (string, error) {
	if c.apiKey == "" {
		return "", errors.New("OPENROUTER_API_KEY is required")
	}

	requestMessages := append([]Message{{Role: "system", Content: systemPrompt}}, messages...)
	body, err := json.Marshal(chatRequest{
		Model:          model,
		Messages:       requestMessages,
		ResponseFormat: responseFormat,
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
		return "", errEmptyResponse
	}
	return strings.TrimSpace(output.Choices[0].Message.Content), nil
}

var errEmptyResponse = errors.New("openrouter returned an empty response")

func jsonObjectResponseFormat() map[string]string {
	return map[string]string{"type": "json_object"}
}

func parseReportJSON(content string) (json.RawMessage, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, errors.New("empty report response")
	}

	if raw, err := validateJSONObject(content); err == nil {
		return raw, nil
	}

	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start == -1 || end == -1 || end <= start {
		return nil, fmt.Errorf("no JSON object found in response starting with %q", firstRune(content))
	}
	return validateJSONObject(content[start : end+1])
}

func validateJSONObject(content string) (json.RawMessage, error) {
	var raw json.RawMessage
	if err := json.Unmarshal([]byte(content), &raw); err != nil {
		return nil, err
	}
	var object map[string]any
	if err := json.Unmarshal(raw, &object); err != nil {
		return nil, err
	}
	return raw, nil
}

func buildReportRepairPrompt() string {
	return `Convert the user's text into valid JSON only.
Return exactly one JSON object and nothing else.
The JSON object must use this exact shape:
{
  "answer_structure": {"score": 1-5, "comment": "..."},
  "reasoning_clarity": {"score": 1-5, "comment": "..."},
  "use_of_examples": {"score": 1-5, "comment": "..."},
  "communication_quality": {"score": 1-5, "comment": "..."},
  "overall_impression": "...",
  "top_strengths": ["...", "..."],
  "top_improvements": ["...", "..."]
}`
}

func firstRune(value string) string {
	for _, char := range value {
		return string(char)
	}
	return ""
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model          string    `json:"model"`
	Messages       []Message `json:"messages"`
	ResponseFormat any       `json:"response_format,omitempty"`
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
