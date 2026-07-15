import { useEffect, useState } from "react";
import type { FacialIndicators } from "../lib/api";

export function useFacialAnalysis(enabled = true) {
  const [indicators, setIndicators] = useState<FacialIndicators | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIndicators(null);
      return;
    }

    let step = 0;
    const interval = window.setInterval(() => {
      step += 1;
      setIndicators({
        eyeContact: clamp(0.7 + Math.sin(step / 4) * 0.16),
        headStability: clamp(0.8 + Math.cos(step / 5) * 0.12),
        facialActivity: clamp(0.42 + Math.sin(step / 3) * 0.22),
      });
    }, 650);

    return () => window.clearInterval(interval);
  }, [enabled]);

  return indicators;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}
