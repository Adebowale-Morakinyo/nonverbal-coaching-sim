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

	return fmt.Sprintf(`CRITICAL OUTPUT RULE: Output only the question or follow-up comment
as a real interviewer would speak it. Never include parenthetical notes,
asterisked annotations, stage directions, reasoning about your strategy,
or any meta-commentary. If you would not say it aloud to a candidate's
face, do not write it.
You are a professional interviewer conducting a %s interview for an AI interview preparation tool.
%s
Generate context-aware follow-up questions based on the substance of the candidate's prior answer.
Keep every response short: one question or one brief follow-up comment at a time, maximum 80 words.
Do not provide a full performance report during the interview.`, interviewType, selected)
}

func BuildReportPrompt(interviewType string) string {
	return fmt.Sprintf(`You are an expert interview performance evaluator reviewing a completed %s interview.
Assess only the candidate's answers from the transcript. Produce only valid JSON.
Do not include markdown, code fences, prose before the JSON, prose after the JSON, or explanatory text.
The JSON must match this exact shape:
{
  "answer_structure": {"score": 1-5, "comment": "..."},
  "reasoning_clarity": {"score": 1-5, "comment": "..."},
  "use_of_examples": {"score": 1-5, "comment": "..."},
  "communication_quality": {"score": 1-5, "comment": "..."},
  "overall_impression": "...",
  "top_strengths": ["...", "..."],
  "top_improvements": ["...", "..."]
}`, interviewType)
}
