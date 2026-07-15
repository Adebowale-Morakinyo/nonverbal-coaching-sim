import { useState } from "react";
import { createSession, type CoachingSession } from "../lib/api";

export function SessionPanel() {
  const [scenario, setScenario] = useState("First meeting with a new client");
  const [session, setSession] = useState<CoachingSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCreateSession() {
    setLoading(true);
    setError(null);
    try {
      setSession(await createSession(scenario));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="session-panel">
      <h2>Session</h2>
      <label>
        Scenario
        <textarea
          value={scenario}
          onChange={(event) => setScenario(event.target.value)}
        />
      </label>

      <button
        className="secondary-action"
        type="button"
        onClick={handleCreateSession}
        disabled={loading}
      >
        {loading ? "Creating..." : "Create session"}
      </button>

      {error ? <p className="error">{error}</p> : null}
      {session ? (
        <dl className="session-meta">
          <div>
            <dt>ID</dt>
            <dd>{session.id}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>{session.state}</dd>
          </div>
        </dl>
      ) : null}
    </aside>
  );
}
