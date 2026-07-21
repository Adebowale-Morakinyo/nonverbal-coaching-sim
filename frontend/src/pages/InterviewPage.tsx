import { motion } from "framer-motion";
import { Bot, Bug, Mic, MicOff, RefreshCw, Send, Square } from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import clsx from "clsx";
import { ConfirmModal } from "../components/ConfirmModal";
import { FaceMeshOverlay } from "../components/FaceMeshOverlay";
import { FacialOverlay } from "../components/FacialOverlay";
import { useCamera } from "../hooks/useCamera";
import { useElevenLabsSpeech } from "../hooks/useElevenLabsSpeech";
import { useFacialAnalysis } from "../hooks/useFacialAnalysis";
import { useSpeechInput } from "../hooks/useSpeechInput";
import { useSimulatedFacialAnalysis } from "../hooks/useSimulatedFacialAnalysis";
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

const SIM_MODE = import.meta.env.VITE_SIMULATION_MODE === "true";

export function InterviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isAdmin = searchParams.get("admin") === "1";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const answerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [session, setSession] = useState<Session | null>(
    (location.state as { session?: Session } | null)?.session ?? null,
  );
  const [turns, setTurns] = useState<SessionTurn[]>([]);
  const [input, setInput] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [voiceToast, setVoiceToast] = useState<string | null>(null);
  const [pendingVoiceSubmit, setPendingVoiceSubmit] = useState(false);
  const spokenResponseIDRef = useRef<string | null>(null);
  const wasSpeakingRef = useRef(false);
  const inputRef = useRef("");
  const voiceSubmitTimeoutRef = useRef<number | null>(null);
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
  const realFacial = useFacialAnalysis(videoRef, !SIM_MODE && fullMultimodal);
  const simFacial = useSimulatedFacialAnalysis(SIM_MODE);
  const {
    indicators,
    landmarks: facialLandmarks,
    isReady: facialAnalysisReady,
    error: facialAnalysisError,
  } = SIM_MODE ? simFacial : realFacial;
  const {
    messages,
    isAiTyping,
    sendTurn,
    connectionStatus,
    reconnect,
    latestAIResponse,
    lastError: socketError,
  } = useSessionSocket(id, turns);
  const { speak, isSpeaking } = useElevenLabsSpeech();
  const queueVoiceTranscript = useCallback(
    (transcript: string) => {
      if (!transcript.trim()) {
        return;
      }

      setInput(transcript);
      inputRef.current = transcript;
      setPendingVoiceSubmit(true);

      if (voiceSubmitTimeoutRef.current) {
        window.clearTimeout(voiceSubmitTimeoutRef.current);
      }

      voiceSubmitTimeoutRef.current = window.setTimeout(() => {
        const answer = inputRef.current.trim();
        setPendingVoiceSubmit(false);
        voiceSubmitTimeoutRef.current = null;
        if (answer) {
          sendTurn(answer);
          setInput("");
          inputRef.current = "";
        }
      }, 1500);
    },
    [sendTurn],
  );
  const {
    isRecording,
    startRecording,
    stopRecording,
    isAvailable: speechInputAvailable,
    error: speechInputError,
  } = useSpeechInput(queueVoiceTranscript);
  const displayedMessages = useMemo(() => messages, [messages]);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [displayedMessages, isAiTyping]);

  useEffect(() => {
    if (SIM_MODE || !fullMultimodal || !indicators || !id) {
      return;
    }

    const interval = window.setInterval(() => {
      void sendSnapshot(id, indicators).catch(() => undefined);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [fullMultimodal, id, indicators]);

  useEffect(() => {
    if (!SIM_MODE) {
      return;
    }

    console.warn(
      "%c[SIMULATION MODE] Facial analysis is simulated. " +
        "Set VITE_SIMULATION_MODE=false before running evaluation sessions.",
      "color: #F59E0B; font-weight: bold",
    );
  }, []);

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

  useEffect(() => {
    if (
      !latestAIResponse ||
      spokenResponseIDRef.current === latestAIResponse.id
    ) {
      return;
    }

    spokenResponseIDRef.current = latestAIResponse.id;
    void speak(latestAIResponse.content);
  }, [latestAIResponse, speak]);

  useEffect(() => {
    if (wasSpeakingRef.current && !isSpeaking) {
      answerInputRef.current?.focus();
    }
    wasSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    if (!voiceToast) {
      return;
    }

    const timeout = window.setTimeout(() => setVoiceToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [voiceToast]);

  useEffect(() => {
    if (speechInputError) {
      setVoiceToast(speechInputError);
    }
  }, [speechInputError]);

  useEffect(() => {
    return () => {
      if (voiceSubmitTimeoutRef.current) {
        window.clearTimeout(voiceSubmitTimeoutRef.current);
      }
    };
  }, []);

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) {
      return;
    }
    if (voiceSubmitTimeoutRef.current) {
      window.clearTimeout(voiceSubmitTimeoutRef.current);
      voiceSubmitTimeoutRef.current = null;
    }
    setPendingVoiceSubmit(false);
    sendTurn(input);
    setInput("");
    inputRef.current = "";
  }

  function handleVoiceToggle() {
    if (isSpeaking || !speechInputAvailable) {
      if (!speechInputAvailable) {
        setVoiceToast("Voice input unavailable — type your answer");
      }
      return;
    }

    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function cancelVoiceSubmit() {
    if (voiceSubmitTimeoutRef.current) {
      window.clearTimeout(voiceSubmitTimeoutRef.current);
      voiceSubmitTimeoutRef.current = null;
    }
    setPendingVoiceSubmit(false);
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
      {(SIM_MODE || fullMultimodal) && !facialAnalysisError ? (
        <FacialOverlay data={indicators} />
      ) : null}
      {!SIM_MODE && fullMultimodal && facialAnalysisError ? (
        <div
          className="absolute right-6 top-6 z-30 max-w-sm rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning shadow-2xl shadow-black/30 backdrop-blur-xl"
          role="status"
          aria-live="polite"
        >
          <p className="font-semibold">
            Facial analysis unavailable — session continues without overlay
          </p>
          <p className="mt-1 text-xs opacity-80">{facialAnalysisError}</p>
        </div>
      ) : null}
      {voiceToast ? (
        <div
          className="absolute left-1/2 top-6 z-40 -translate-x-1/2 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning shadow-2xl shadow-black/30 backdrop-blur-xl"
          role="status"
          aria-live="polite"
        >
          {voiceToast}
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
            {facialAnalysisReady && facialLandmarks ? (
              <FaceMeshOverlay landmarks={facialLandmarks} />
            ) : null}
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

          {SIM_MODE || fullMultimodal ? (
            <p className="mt-3 text-xs text-text-muted">
              {SIM_MODE
                ? "Analysis Active"
                : `Facial analysis ${
                    facialAnalysisError
                      ? "unavailable"
                      : facialAnalysisReady
                        ? "live"
                        : "loading"
                  }`}
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
          {isSpeaking ? (
            <div
              className="mx-5 mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
              role="status"
              aria-live="polite"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              AI speaking...
            </div>
          ) : null}
          {socketError ? (
            <div
              className="mx-5 mt-4 rounded-input border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
              role="status"
              aria-live="polite"
            >
              {socketError}
            </div>
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
                isSpeaking={
                  isSpeaking &&
                  message.role === "ai" &&
                  message.id === latestAIResponse?.id
                }
              />
            ))}
            {isAiTyping ? <TypingIndicator /> : null}
          </div>

          <form className="border-t border-border p-4" onSubmit={handleSend}>
            <div className="flex items-end gap-3 rounded-card border border-border bg-background p-2">
              <button
                className={clsx(
                  "relative rounded-full border p-3 transition active:scale-[0.97]",
                  isRecording
                    ? "border-danger bg-danger/10 text-danger shadow-lg shadow-danger/30"
                    : speechInputAvailable && !isSpeaking
                      ? "border-border text-text-muted hover:text-text"
                      : "cursor-not-allowed border-border bg-surface-2 text-text-muted/50",
                )}
                type="button"
                onClick={handleVoiceToggle}
                disabled={isSpeaking || !speechInputAvailable}
                aria-label={
                  speechInputAvailable
                    ? "Toggle voice input"
                    : "Voice input unavailable"
                }
                title={
                  isSpeaking
                    ? "Wait for AI to finish"
                    : speechInputAvailable
                      ? "Toggle voice input"
                      : "Voice input unavailable — type your answer"
                }
              >
                {isRecording ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
                ) : null}
                {isRecording ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
              <textarea
                ref={answerInputRef}
                className="max-h-36 min-h-12 flex-1 resize-none bg-transparent px-1 py-3 text-sm text-text outline-none placeholder:text-text-muted"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Type your answer..."
                rows={1}
                aria-label="Candidate answer"
              />
              {pendingVoiceSubmit ? (
                <button
                  className="rounded-input border border-border px-3 py-2 text-xs font-semibold text-text-muted hover:text-text"
                  type="button"
                  onClick={cancelVoiceSubmit}
                  aria-label="Cancel automatic voice answer submission"
                >
                  Cancel
                </button>
              ) : null}
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
            "relative rounded-full border p-3 transition active:scale-[0.97]",
            isRecording
              ? "border-danger bg-danger/10 text-danger shadow-lg shadow-danger/30"
              : speechInputAvailable && !isSpeaking
                ? "border-border text-text-muted hover:text-text"
                : "cursor-not-allowed border-border bg-surface-2 text-text-muted/50",
          )}
          type="button"
          onClick={handleVoiceToggle}
          disabled={isSpeaking || !speechInputAvailable}
          aria-label={
            speechInputAvailable
              ? "Toggle voice input"
              : "Voice input unavailable"
          }
          title={
            isSpeaking
              ? "Wait for AI to finish"
              : speechInputAvailable
                ? "Toggle voice input"
                : "Voice input unavailable — type your answer"
          }
        >
          {isRecording ? (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
          ) : null}
          {isRecording ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <span className="rounded-full bg-surface-2 px-4 py-2 text-sm font-medium text-text-muted">
          {isRecording
            ? "Listening..."
            : isSpeaking
              ? "AI speaking..."
              : "Interview in progress..."}
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
  isSpeaking,
}: {
  role: "ai" | "candidate";
  content: string;
  isSpeaking?: boolean;
}) {
  const isAI = role === "ai";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx("flex gap-3", isAI ? "justify-start" : "justify-end")}
    >
      {isAI ? (
        <div className="flex flex-col items-center gap-2">
          <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">
            AI
          </span>
          {isSpeaking ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary"
              role="status"
              aria-live="polite"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Speaking
            </span>
          ) : null}
        </div>
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
      <div className="flex items-center gap-3 rounded-card bg-surface-2 px-4 py-3">
        <span className="text-xs font-medium text-text-muted">Thinking...</span>
        <span className="flex gap-1" aria-label="AI is thinking">
          <span className="dot h-2 w-2 rounded-full bg-text-muted" />
          <span className="dot h-2 w-2 rounded-full bg-text-muted" />
          <span className="dot h-2 w-2 rounded-full bg-text-muted" />
        </span>
      </div>
    </div>
  );
}
