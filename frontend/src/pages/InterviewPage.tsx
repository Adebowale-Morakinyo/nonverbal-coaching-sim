import { motion } from "framer-motion";
import { Bot, Mic, MicOff, Send, Square } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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
  const indicators = useFacialAnalysis(fullMultimodal);
  const { messages, isAiTyping, sendTurn, connectionStatus } = useSessionSocket(
    id,
    turns,
  );
  const displayedMessages = useMemo(
    () =>
      messages.length
        ? messages
        : [
            {
              id: "welcome",
              role: "ai" as const,
              content:
                "Welcome. Tell me about yourself and the role you are preparing for.",
            },
          ],
    [messages],
  );

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

  return (
    <main className="relative min-h-screen overflow-hidden bg-background p-4 text-text lg:p-6">
      {fullMultimodal ? <FacialOverlay data={indicators} /> : null}

      <div className="grid h-[calc(100vh-96px)] gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="rounded-card border border-border bg-surface p-4 shadow-2xl shadow-black/20">
          <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-black shadow-inner shadow-white/5">
            <video
              ref={videoRef}
              className="aspect-video h-full w-full scale-x-[-1] object-cover"
              autoPlay
              muted
              playsInline
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
              />
              <button
                className="rounded-input bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dim"
                type="submit"
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
