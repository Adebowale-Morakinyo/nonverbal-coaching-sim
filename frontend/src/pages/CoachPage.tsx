import { Activity, Camera, MessageSquare, Play } from "lucide-react";
import { SessionPanel } from "../components/SessionPanel";

export function CoachPage() {
  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Nonverbal Coaching Sim</p>
            <h1>Practice realistic conversation presence.</h1>
          </div>
          <button className="primary-action" type="button">
            <Play size={18} />
            Start
          </button>
        </header>

        <div className="coach-layout">
          <section className="video-stage" aria-label="camera preview">
            <div className="camera-placeholder">
              <Camera size={48} />
            </div>
            <div className="signal-strip">
              <span>
                <Activity size={16} />
                Face tracking idle
              </span>
              <span>
                <MessageSquare size={16} />
                Coach ready
              </span>
            </div>
          </section>

          <SessionPanel />
        </div>
      </section>
    </main>
  );
}
