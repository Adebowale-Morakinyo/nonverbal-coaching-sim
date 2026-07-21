import { ChevronDown, ChevronUp, Eye, Gauge, Sparkles } from "lucide-react";
import { useState } from "react";
import type { FacialIndicators } from "../lib/api";

type FacialOverlayProps = {
  data: FacialIndicators | null;
};

const SIM_MODE = import.meta.env.VITE_SIMULATION_MODE === "true";

export function FacialOverlay({ data }: FacialOverlayProps) {
  const [collapsed, setCollapsed] = useState(false);
  const indicators = [
    { label: "Eye Contact", value: data?.eyeContactRatio, icon: Eye },
    { label: "Head Stability", value: data?.headStability, icon: Gauge },
    { label: "Expressiveness", value: data?.facialActivity, icon: Sparkles },
  ];

  return (
    <div
      className="absolute right-6 top-6 z-30 w-80 rounded-card border border-white/10 bg-surface/70 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-text">Facial Overlay</p>
          <p className="text-xs text-text-muted">Live multimodal indicators</p>
        </div>
        <button
          className="rounded-full border border-border p-1.5 text-text-muted hover:border-primary hover:text-text"
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand overlay" : "Collapse overlay"}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {collapsed ? (
        <div className="mt-4 flex gap-2">
          {indicators.map((indicator) => {
            const Icon = indicator.icon;
            return (
              <span
                className="rounded-full border border-border bg-surface-2 p-2 text-text-muted"
                key={indicator.label}
                title={indicator.label}
              >
                <Icon size={16} />
              </span>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {indicators.map((indicator) => (
            <IndicatorRow
              key={indicator.label}
              label={indicator.label}
              value={indicator.value}
            />
          ))}
        </div>
      )}
      {SIM_MODE ? (
        <p className="mt-3 text-[10px] font-semibold text-warning opacity-60">
          ⚠ SIMULATION
        </p>
      ) : null}
    </div>
  );
}

function IndicatorRow({ label, value }: { label: string; value?: number }) {
  const percent = value == null ? 0 : Math.round(value * 100);
  const color =
    percent > 65 ? "bg-success" : percent >= 40 ? "bg-warning" : "bg-danger";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-text-muted">{label}</span>
        <span className="font-semibold text-text">
          {value == null ? "--" : `${percent}%`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${color} transition-all duration-200 ease-smooth`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
