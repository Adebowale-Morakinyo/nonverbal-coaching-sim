import { motion } from "framer-motion";
import { ArrowRight, Circle } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import {
  createSession,
  type InterviewType,
  type SessionCondition,
} from "../lib/api";

const interviewTypes: Array<{ label: string; value: InterviewType }> = [
  { label: "Behavioural", value: "behavioural" },
  { label: "Technical", value: "technical" },
  { label: "Mixed", value: "mixed" },
];

export function SetupPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isAdmin = searchParams.get("admin") === "1";
  const [name, setName] = useState("");
  const [interviewType, setInterviewType] =
    useState<InterviewType>("behavioural");
  const [condition, setCondition] =
    useState<SessionCondition>("full_multimodal");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const subtitle = useMemo(() => {
    if (interviewType === "technical") {
      return "Problem solving, reasoning aloud, and concise technical delivery.";
    }
    if (interviewType === "mixed") {
      return "A balanced practice session covering behavioural and technical depth.";
    }
    return "STAR-method structure, confidence, and professional presence.";
  }, [interviewType]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const session = await createSession({ name, interviewType, condition });
      navigate(`/session/${session.id}${isAdmin ? "?admin=1" : ""}`, {
        state: { session, participantName: name },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to start the session. Check that the backend is running.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-xl rounded-card border border-border bg-surface/90 p-8 shadow-2xl shadow-black/30"
      >
        <div className="mb-8 text-center">
          <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-lg shadow-primary/20">
            <Circle size={14} fill="currentColor" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Nonverbal Coaching Simulator
          </h1>
          <p className="mt-3 text-sm font-medium text-primary">
            AI-powered interview practice
          </p>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-text-muted">
            {subtitle}
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text">
              Your name
            </span>
            <input
              className="w-full rounded-input border border-border bg-background px-4 py-3 text-sm text-text outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Optional"
            />
          </label>

          <div>
            <span className="mb-2 block text-sm font-medium text-text">
              Interview type
            </span>
            <div className="grid grid-cols-3 gap-2 rounded-card border border-border bg-background p-1.5">
              {interviewTypes.map((type) => (
                <button
                  className={clsx(
                    "rounded-input px-3 py-2.5 text-sm font-semibold transition",
                    interviewType === type.value
                      ? "bg-primary text-white shadow-lg shadow-primary/20"
                      : "text-text-muted hover:bg-surface-2 hover:text-text",
                  )}
                  key={type.value}
                  type="button"
                  onClick={() => setInterviewType(type.value)}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {isAdmin ? (
            <div>
              <span className="mb-2 block text-sm font-medium text-text">
                Condition
              </span>
              <div className="grid grid-cols-2 gap-2 rounded-card border border-border bg-background p-1.5">
                {[
                  { label: "Verbal-only", value: "verbal_only" },
                  { label: "Full multimodal", value: "full_multimodal" },
                ].map((option) => (
                  <button
                    className={clsx(
                      "rounded-input px-3 py-2.5 text-sm font-semibold transition",
                      condition === option.value
                        ? "bg-primary text-white"
                        : "text-text-muted hover:bg-surface-2 hover:text-text",
                    )}
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setCondition(option.value as SessionCondition)
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            className="shimmer-button group flex w-full items-center justify-center gap-2 rounded-input bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary-dim hover:shadow-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={loading}
            aria-label="Start interview session"
          >
            {loading ? "Starting..." : "Start Session"}
            <ArrowRight
              className="transition-transform group-hover:translate-x-0.5"
              size={18}
            />
          </button>
        </form>
      </motion.section>
    </main>
  );
}
