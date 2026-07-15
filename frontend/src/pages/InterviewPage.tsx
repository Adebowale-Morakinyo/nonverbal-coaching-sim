import { motion } from "framer-motion";
import { Bot, Bug, Mic, MicOff, RefreshCw, Send, Square } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import clsx from "clsx";
import { ConfirmModal } from "../components/ConfirmModal";
import { FacialOverlay } from "../components/FacialOverlay";
import { useCamera } from "../hooks/useCamera";
import { useFacialAnalysis } from "../hooks/useFacialAnalysis";
import { useSessionSocket } from "../hooks/useSessionSocket";
import { useTimer } from "../hooks/useTimer";
import {
  endSession,
  getSession,
  sendSnapshot,
  type Session,
  type SessionTurn,
} from "../lib/api";
import { formatInterviewType, formatTimer } from "../lib/format";

export function InterviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isAdmin = searchParams.get("admin") === "1";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<Session | null>(
    (location.state as { session?: Session } | null)?.session ?? null,
  );
  const [turns, setTurns] = useState<SessionTurn[]>([]);
  const [input, setInput] = useState("");
  const [micActive, setMicActive] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const timer = useTimer(true);
  const { error: cameraError } = useCamera(videoRef);

  useEffect(() => {
    let active = true;
    async function loadSession() {
      try {
        const loaded = await getSession(id);
        if (active) {
          setSession(loaded);
          setTurns(loaded.turns ?? []);
        }
      } catch (err) {
        if (active) {
          setLoadError(
            err instanceof Error ? err.message : "Unable to load session",
          );
        }
      }
    }

    if (id) {
      void loadSession();
    }
    return () => {
      active = false;
    };
  }, [id]);

  const fullMultimodal = session?.condition === "full_multimodal";
  const {
    indicators,
    isReady: facialAnalysisReady,
    error: facialAnalysisError,
  } = useFacialAnalysis(videoRef, fullMultimodal);
  const { messages, isAiTyping, sendTurn, connectionStatus, reconnect } =
    useSessionSocket(id, turns);
  const displayedMessages = useMemo(() => messages, [messages]);

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [displayedMessages, isAiTyping]);

  useEffect(() => {
    if (!fullMultimodal || !indicators || !id) {
      return;
    }

    const interval = window.setInterval(() => {
      void sendSnapshot(id, indicators).catch(() => undefined);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [fullMultimodal, id, indicators]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setDebugOpen((value) => !value);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAdmin]);

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) {
      return;
    }
    sendTurn(input);
    setInput("");
  }

  async function handleEndSession() {
    setEnding(true);
    try {
      await endSession(id);
    } catch {
      // Navigation still goes to the report route; ReportPage owns the fetch state.
    } finally {
      navigate(`/session/${id}/report`, {
        state: {
          session,
          participantName:
            (location.state as { participantName?: string } | null)
              ?.participantName ?? session?.participant_code,
        },
      });
    }
  }

  if (connectionStatus === "connecting") {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-text">
        <div className="text-center">
          <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-2 border-border border-t-primary" />
          <h1 className="text-xl font-semibold">
            Connecting to interviewer...
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Preparing the live interview channel.
          </p>
        </div>
      </main>
    );
  }

  if (connectionStatus === "failed") {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-text">
        <section className="max-w-md rounded-card border border-border bg-surface p-6 text-center shadow-2xl shadow-black/20">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-danger/10 text-danger">
            <RefreshCw size={22} />
          </div>
          <h1 className="text-xl font-semibold">Connection lost</h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            The interviewer connection failed after several attempts. Check the
            backend server and reconnect when ready.
          </p>
          <button
            className="mt-6 rounded-input bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dim"
            type="button"
            onClick={reconnect}
            aria-label="Reconnect to interviewer"
          >
            Reconnect
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background p-4 text-text lg:p-6">
      {fullMultimodal && !facialAnalysisError ? (
        <FacialOverlay data={indicators} />
      ) : null}
      {fullMultimodal && facialAnalysisError ? (
        <div
          className="absolute right-6 top-6 z-30 max-w-sm rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning shadow-2xl shadow-black/30 backdrop-blur-xl"
          role="status"
          aria-live="polite"
        >
          Facial analysis unavailable — session continues without overlay
        </div>
      ) : null}

      <div className="grid h-[calc(100vh-96px)] gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="rounded-card border border-border bg-surface p-4 shadow-2xl shadow-black/20">
          <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-black shadow-inner shadow-white/5">
            <video
              ref={videoRef}
              className="aspect-video h-full w-full scale-x-[-1] object-cover"
              autoPlay
              muted
              playsInline
              aria-label="Your camera feed"
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.35))]" />
            <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs font-semibold text-text backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
              Camera Active
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-text-muted">
                Session timer
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {formatTimer(timer)}
              </p>
            </div>
            <div className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-muted">
              {connectionStatus}
            </div>
          </div>

          {fullMultimodal ? (
            <p className="mt-3 text-xs text-text-muted">
              Facial analysis{" "}
              {facialAnalysisError
                ? "unavailable"
                : facialAnalysisReady
                  ? "live"
                  : "loading"}
            </p>
          ) : null}

          {cameraError ? (
            <p className="mt-4 rounded-input border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              {cameraError}. The interview can continue without video preview.
            </p>
          ) : null}
        </section>

        <section className="flex min-h-0 flex-col rounded-card border border-border bg-surface shadow-2xl shadow-black/20">
          <header className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-primary">
                {formatInterviewType(session?.interview_type)}
              </p>
              <h1 className="mt-1 text-xl font-semibold">Conversation</h1>
            </div>
            <button
              className="text-sm font-medium text-text-muted hover:text-danger"
              type="button"
              onClick={() => setConfirmOpen(true)}
              aria-label="End interview session"
            >
              End Session
            </button>
          </header>

          {loadError ? (
            <p className="mx-5 mt-4 rounded-input border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              {loadError}. Visual preview is using local state.
            </p>
          ) : null}

          <div
            ref={messageListRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5"
          >
            {displayedMessages.map((message) => (
              <MessageBubble
                key={message.id}
                role={message.role}
                content={message.content}
              />
            ))}
            {isAiTyping ? <TypingIndicator /> : null}
          </div>

          <form className="border-t border-border p-4" onSubmit={handleSend}>
            <div className="flex items-end gap-3 rounded-card border border-border bg-background p-2">
              <button
                className={clsx(
                  "rounded-full border p-3",
                  micActive
                    ? "border-primary bg-primary/10 text-primary shadow-lg shadow-primary/20"
                    : "border-border text-text-muted hover:text-text",
                )}
                type="button"
                onClick={() => setMicActive((value) => !value)}
                aria-label="Toggle microphone"
              >
                {micActive ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
              <textarea
                className="max-h-36 min-h-12 flex-1 resize-none bg-transparent px-1 py-3 text-sm text-text outline-none placeholder:text-text-muted"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Type your answer..."
                rows={1}
                aria-label="Candidate answer"
              />
              <button
                className="rounded-input bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dim"
                type="submit"
                aria-label="Send answer"
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        </section>
      </div>

      <div className="no-print fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-4 rounded-full border border-border bg-surface/90 px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur">
        <button
          className={clsx(
            "rounded-full border p-3",
            micActive
              ? "border-primary bg-primary/10 text-primary shadow-lg shadow-primary/30"
              : "border-border text-text-muted hover:text-text",
          )}
          type="button"
          onClick={() => setMicActive((value) => !value)}
          aria-label="Toggle microphone"
        >
          {micActive ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <span className="rounded-full bg-surface-2 px-4 py-2 text-sm font-medium text-text-muted">
          Interview in progress...
        </span>
        <button
          className="inline-flex items-center gap-2 rounded-full border border-danger/40 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10"
          type="button"
          onClick={() => setConfirmOpen(true)}
          aria-label="End interview session"
        >
          <Square size={14} />
          End
        </button>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="End this interview?"
        message="The session will close and a report will be generated from the conversation so far."
        confirmLabel={ending ? "Ending..." : "End Session"}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleEndSession()}
      />

      {isAdmin ? (
        <DebugPanel
          open={debugOpen}
          indicators={indicators}
          connectionStatus={connectionStatus}
          turnCount={displayedMessages.length}
          sessionID={id}
          onToggle={() => setDebugOpen((value) => !value)}
        />
      ) : null}
    </main>
  );
}

function MessageBubble({
  role,
  content,
}: {
  role: "ai" | "candidate";
  content: string;
}) {
  const isAI = role === "ai";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx("flex gap-3", isAI ? "justify-start" : "justify-end")}
    >
      {isAI ? (
        <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">
          AI
        </span>
      ) : null}
      <div
        className={clsx(
          "max-w-[76%] rounded-card px-4 py-3 text-sm leading-6",
          isAI ? "bg-surface-2 text-text" : "bg-primary-dim text-white",
        )}
      >
        {content}
      </div>
    </motion.div>
  );
}

function DebugPanel({
  open,
  indicators,
  connectionStatus,
  turnCount,
  sessionID,
  onToggle,
}: {
  open: boolean;
  indicators: {
    eyeContactRatio: number;
    headStability: number;
    facialActivity: number;
  } | null;
  connectionStatus: string;
  turnCount: number;
  sessionID: string;
  onToggle: () => void;
}) {
  return (
    <div className="fixed bottom-4 left-4 z-40 rounded-card border border-border bg-surface/90 p-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <button
        className="flex items-center gap-2 text-xs font-semibold text-text-muted hover:text-text"
        type="button"
        onClick={onToggle}
        aria-label="Toggle debug panel"
      >
        <Bug size={15} />
        Debug
      </button>
      {open ? (
        <dl className="mt-3 grid min-w-72 gap-2 text-xs">
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Session</dt>
            <dd className="max-w-40 truncate font-mono text-text">
              {sessionID}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">WebSocket</dt>
            <dd className="font-mono text-text">{connectionStatus}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Turns</dt>
            <dd className="font-mono text-text">{turnCount}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Eye</dt>
            <dd className="font-mono text-text">
              {indicators?.eyeContactRatio.toFixed(3) ?? "null"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Head</dt>
            <dd className="font-mono text-text">
              {indicators?.headStability.toFixed(3) ?? "null"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Activity</dt>
            <dd className="font-mono text-text">
              {indicators?.facialActivity.toFixed(3) ?? "null"}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-white">
        <Bot size={16} />
      </span>
      <div className="flex gap-1 rounded-card bg-surface-2 px-4 py-3">
        {[0, 1, 2].map((dot) => (
          <motion.span
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: dot * 0.12,
            }}
            className="h-2 w-2 rounded-full bg-text-muted"
            key={dot}
          />
        ))}
      </div>
    </div>
  );
}
