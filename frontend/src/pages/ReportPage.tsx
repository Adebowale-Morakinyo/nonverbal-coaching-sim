import { ArrowUpRight, Check, Download, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import clsx from "clsx";
import {
  getReport,
  type NonverbalSummary,
  type Report,
  type Session,
  type VerbalDimension,
} from "../lib/api";

const dimensionLabels = [
  ["answer_structure", "Answer Structure"],
  ["reasoning_clarity", "Reasoning Clarity"],
  ["use_of_examples", "Use of Examples"],
  ["communication_quality", "Communication Quality"],
] as const;

export function ReportPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const session = (location.state as { session?: Session } | null)?.session;
  const participantName =
    (location.state as { participantName?: string } | null)?.participantName ??
    session?.participant_code ??
    "Participant";
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadReport() {
      try {
        const loaded = await getReport(id);
        if (active) {
          setReport(loaded);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Unable to load report",
          );
        }
      }
    }

    void loadReport();
    return () => {
      active = false;
    };
  }, [id]);

  const createdAt = useMemo(() => {
    const value = report?.created_at ? new Date(report.created_at) : new Date();
    return value.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [report?.created_at]);

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-text print:bg-white">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-primary">
              Session Report
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">
              {participantName}
            </h1>
            <p className="mt-2 text-text-muted">{createdAt}</p>
          </div>
          <div className="no-print flex gap-3">
            <Link
              className="rounded-input border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:text-text"
              to="/"
            >
              <RotateCcw className="mr-2 inline" size={16} />
              Practice Again
            </Link>
            <button
              className="rounded-input bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dim"
              type="button"
              onClick={() => window.print()}
            >
              <Download className="mr-2 inline" size={16} />
              Download Report
            </button>
          </div>
        </header>

        {error ? (
          <div className="print-surface rounded-card border border-warning/30 bg-warning/10 p-6 text-warning">
            {error}
          </div>
        ) : null}

        {!report && !error ? <ReportSkeleton /> : null}

        {report ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {dimensionLabels.map(([key, label]) => (
                <ScoreCard
                  key={key}
                  label={label}
                  dimension={report.verbal_analysis[key]}
                />
              ))}
            </div>

            <section className="print-surface rounded-card border border-border bg-surface p-6">
              <h2 className="text-xl font-semibold">Overall impression</h2>
              <p className="mt-3 max-w-4xl text-lg leading-8 text-text-muted">
                {report.verbal_analysis.overall_impression}
              </p>
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <ListPanel
                title="Strengths"
                items={report.verbal_analysis.top_strengths}
                tone="success"
              />
              <ListPanel
                title="Areas to Improve"
                items={report.verbal_analysis.top_improvements}
                tone="warning"
              />
            </div>

            {report.nonverbal_summary ? (
              <NonverbalSection summary={report.nonverbal_summary} />
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ScoreCard({
  label,
  dimension,
}: {
  label: string;
  dimension: VerbalDimension;
}) {
  const score = Math.max(1, Math.min(5, dimension.score));
  const circumference = 2 * Math.PI * 38;
  const offset = circumference - (score / 5) * circumference;

  return (
    <article className="print-surface rounded-card border border-border bg-surface p-5">
      <div className="relative mb-5 h-24 w-24">
        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96">
          <circle
            cx="48"
            cy="48"
            r="38"
            stroke="currentColor"
            strokeWidth="8"
            className="text-surface-2"
            fill="none"
          />
          <circle
            cx="48"
            cy="48"
            r="38"
            stroke="currentColor"
            strokeWidth="8"
            className="text-primary"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-3xl font-bold">
          {score}
        </span>
      </div>
      <h2 className="text-lg font-semibold">{label}</h2>
      <p className="mt-3 text-sm leading-6 text-text-muted">
        {dimension.comment}
      </p>
    </article>
  );
}

function ListPanel({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "success" | "warning";
}) {
  return (
    <section className="print-surface rounded-card border border-border bg-surface p-6">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            className="flex gap-3 text-sm leading-6 text-text-muted"
            key={item}
          >
            <span
              className={clsx(
                "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full",
                tone === "success"
                  ? "bg-success/10 text-success"
                  : "bg-warning/10 text-warning",
              )}
            >
              {tone === "success" ? (
                <Check size={14} />
              ) : (
                <ArrowUpRight size={14} />
              )}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NonverbalSection({ summary }: { summary: NonverbalSummary }) {
  const rows = [
    ["Eye Contact", summary.eye_contact_ratio],
    ["Head Stability", summary.head_stability],
    ["Expressiveness", summary.facial_activity],
  ] as const;

  return (
    <section className="print-surface rounded-card border border-border bg-surface p-6">
      <h2 className="text-xl font-semibold">Nonverbal summary</h2>
      <p className="mt-2 text-sm text-text-muted">
        {summary.summary ?? "Session averages from captured facial indicators."}
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {rows.map(([label, value]) => {
          const percent = value == null ? 0 : Math.round(value * 100);
          return (
            <div className="rounded-card bg-surface-2 p-4" key={label}>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-text-muted">{label}</span>
                <strong>{value == null ? "--" : `${percent}%`}</strong>
              </div>
              <div className="h-2 rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            className="h-60 animate-pulse rounded-card border border-border bg-surface"
            key={item}
          />
        ))}
      </div>
      <div className="h-44 animate-pulse rounded-card border border-border bg-surface" />
    </div>
  );
}
