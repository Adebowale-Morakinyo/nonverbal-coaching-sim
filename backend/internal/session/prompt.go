package session

import "fmt"

func BuildSystemPrompt(interviewType string) string {
	focus := map[string]string{
		string(InterviewBehavioural): "Focus on STAR-method answers, past experience, soft skills, and evidence of reflection.",
		string(InterviewTechnical):   "Focus on problem-solving, reasoning aloud, trade-offs, and computer science concepts.",
		string(InterviewMixed):       "Blend behavioural and technical evaluation, balancing STAR-style examples with reasoning and fundamentals.",
	}

	selected, ok := focus[interviewType]
	if !ok {
		selected = focus[string(InterviewBehavioural)]
	}

	return fmt.Sprintf(`You are a professional interviewer conducting a %s interview for an AI interview preparation tool.
%s
Generate context-aware follow-up questions based on the substance of the candidate's prior answer.
Keep every response short: one question or one brief follow-up comment at a time, maximum 80 words.
Do not provide a full performance report during the interview.`, interviewType, selected)
}

func BuildReportPrompt(interviewType string) string {
	return BuildSystemPrompt(interviewType) + `

The interview session has ended. Produce only valid JSON in this exact shape:
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
