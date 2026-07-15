package session

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type Condition string

const (
	ConditionVerbalOnly     Condition = "verbal_only"
	ConditionFullMultimodal Condition = "full_multimodal"
)

type InterviewType string

const (
	InterviewBehavioural InterviewType = "behavioural"
	InterviewTechnical   InterviewType = "technical"
	InterviewMixed       InterviewType = "mixed"
)

type Role string

const (
	RoleAI        Role = "ai"
	RoleCandidate Role = "candidate"
)

type Session struct {
	ID              uuid.UUID     `json:"id"`
	Condition       Condition     `json:"condition"`
	InterviewType   InterviewType `json:"interview_type"`
	ParticipantCode *string       `json:"participant_code,omitempty"`
	CreatedAt       time.Time     `json:"created_at"`
	EndedAt         *time.Time    `json:"ended_at,omitempty"`
	PreConfidence   *int          `json:"pre_confidence,omitempty"`
	PostConfidence  *int          `json:"post_confidence,omitempty"`
}

type Turn struct {
	ID        int       `json:"id"`
	SessionID uuid.UUID `json:"session_id"`
	Role      Role      `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type FacialSnapshot struct {
	ID              int       `json:"id"`
	SessionID       uuid.UUID `json:"session_id"`
	CapturedAt      time.Time `json:"captured_at"`
	EyeContactRatio float64   `json:"eye_contact_ratio"`
	HeadStability   float64   `json:"head_stability"`
	FacialActivity  float64   `json:"facial_activity"`
}

type Report struct {
	ID               int             `json:"id"`
	SessionID        uuid.UUID       `json:"session_id"`
	VerbalAnalysis   json.RawMessage `json:"verbal_analysis"`
	NonverbalSummary json.RawMessage `json:"nonverbal_summary,omitempty"`
	CreatedAt        time.Time       `json:"created_at"`
}

type SessionDetail struct {
	Session
	Turns []Turn `json:"turns"`
}

func ParseCondition(value string) (Condition, error) {
	switch Condition(value) {
	case ConditionVerbalOnly, ConditionFullMultimodal:
		return Condition(value), nil
	default:
		return "", fmt.Errorf("condition must be %q or %q", ConditionVerbalOnly, ConditionFullMultimodal)
	}
}

func ParseInterviewType(value string) (InterviewType, error) {
	if value == "" {
		return InterviewBehavioural, nil
	}
	switch InterviewType(value) {
	case InterviewBehavioural, InterviewTechnical, InterviewMixed:
		return InterviewType(value), nil
	default:
		return "", fmt.Errorf("interview_type must be %q, %q, or %q", InterviewBehavioural, InterviewTechnical, InterviewMixed)
	}
}
