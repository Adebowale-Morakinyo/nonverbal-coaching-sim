export type CoachingSession = {
  id: string;
  scenario: string;
  state: "created" | "active" | "ended";
  createdAt: string;
  updatedAt: string;
};

export async function createSession(
  scenario: string,
): Promise<CoachingSession> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<CoachingSession>;
}
