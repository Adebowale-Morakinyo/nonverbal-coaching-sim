export type SessionCondition = "verbal_only" | "full_multimodal";
export type InterviewType = "behavioural" | "technical" | "mixed";
export type MessageRole = "ai" | "candidate";

export type SessionTurn = {
  id: number;
  session_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
};

export type Session = {
  id: string;
  condition: SessionCondition;
  interview_type: InterviewType;
  participant_code?: string | null;
  created_at?: string;
  ended_at?: string | null;
  turns?: SessionTurn[];
};

export type FacialIndicators = {
  eyeContact: number;
  headStability: number;
  facialActivity: number;
};

export type VerbalDimension = {
  score: number;
  comment: string;
};

export type VerbalAnalysis = {
  answer_structure: VerbalDimension;
  reasoning_clarity: VerbalDimension;
  use_of_examples: VerbalDimension;
  communication_quality: VerbalDimension;
  overall_impression: string;
  top_strengths: string[];
  top_improvements: string[];
};

export type NonverbalSummary = {
  samples?: number;
  eye_contact_ratio?: number | null;
  head_stability?: number | null;
  facial_activity?: number | null;
  summary?: string;
};

export type Report = {
  id: number;
  session_id: string;
  verbal_analysis: VerbalAnalysis;
  nonverbal_summary?: NonverbalSummary | null;
  created_at: string;
};

export type CreateSessionConfig = {
  name?: string;
  interviewType: InterviewType;
  condition: SessionCondition;
};

export async function createSession(
  config: CreateSessionConfig,
): Promise<Session> {
  return request<Session>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      condition: config.condition,
      interview_type: config.interviewType,
      participant_code: config.name?.trim() || undefined,
    }),
  });
}

export async function getSession(id: string): Promise<Session> {
  return request<Session>(`/api/sessions/${id}`);
}

export async function sendTurn(id: string, content: string) {
  return request<{ type: "ai_response"; content: string; turn_index: number }>(
    `/api/sessions/${id}/turns`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  );
}

export async function sendSnapshot(id: string, indicators: FacialIndicators) {
  await request<void>(`/api/sessions/${id}/snapshot`, {
    method: "POST",
    body: JSON.stringify({
      eye_contact_ratio: indicators.eyeContact,
      head_stability: indicators.headStability,
      facial_activity: indicators.facialActivity,
    }),
  });
}

export async function endSession(id: string): Promise<Report> {
  return request<Report>(`/api/sessions/${id}/end`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getReport(id: string): Promise<Report> {
  return request<Report>(`/api/sessions/${id}/report`);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
