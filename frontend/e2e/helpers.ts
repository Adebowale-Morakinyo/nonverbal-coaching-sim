import type { Page, Route } from "@playwright/test";

export const sessionID = "11111111-1111-4111-8111-111111111111";

const report = {
  id: 1,
  session_id: sessionID,
  verbal_analysis: {
    answer_structure: { score: 4, comment: "Clear opening and structure." },
    reasoning_clarity: { score: 4, comment: "Reasoning was easy to follow." },
    use_of_examples: { score: 3, comment: "Examples were relevant." },
    communication_quality: { score: 5, comment: "Confident and concise." },
    overall_impression: "A strong practice interview with clear next steps.",
    top_strengths: ["Concise answers", "Professional tone"],
    top_improvements: ["Add metrics", "Tighten endings"],
  },
  nonverbal_summary: null,
  created_at: new Date().toISOString(),
};

export async function mockBackend(page: Page) {
  await page.route("**/api/sessions", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: sessionID,
        condition: "verbal_only",
        interview_type: "behavioural",
      }),
    });
  });

  await page.route(`**/api/sessions/${sessionID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: sessionID,
        condition: "verbal_only",
        interview_type: "behavioural",
        participant_code: "Taylor",
        turns: [],
      }),
    });
  });

  await page.route(`**/api/sessions/${sessionID}/snapshot`, fulfillOK);
  await page.route(`**/api/sessions/${sessionID}/end`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(report),
    });
  });
  await page.route(`**/api/sessions/${sessionID}/report`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(report),
    });
  });
}

export async function installMockWebSocket(page: Page) {
  await page.addInitScript(() => {
    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      readyState = MockWebSocket.CONNECTING;

      constructor() {
        window.setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event("open"));
          this.emit({
            type: "ai_response",
            content: "Welcome. Tell me about the role you are preparing for.",
            turn_index: 1,
          });
        }, 100);
      }

      send(payload: string) {
        const parsed = JSON.parse(payload) as { type: string };
        if (parsed.type === "candidate_turn") {
          window.setTimeout(() => {
            this.emit({
              type: "ai_response",
              content: "Good. What was the measurable outcome?",
              turn_index: 2,
            });
          }, 150);
        }
        if (parsed.type === "end_session") {
          this.emit({ type: "session_ended", report: {} });
        }
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.(new CloseEvent("close"));
      }

      emit(data: unknown) {
        this.onmessage?.(
          new MessageEvent("message", { data: JSON.stringify(data) }),
        );
      }

      addEventListener() {}
      removeEventListener() {}
    }

    Object.assign(MockWebSocket, {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
    });
    window.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });
}

async function fulfillOK(route: Route) {
  await route.fulfill({
    status: 204,
    contentType: "application/json",
    body: "",
  });
}
