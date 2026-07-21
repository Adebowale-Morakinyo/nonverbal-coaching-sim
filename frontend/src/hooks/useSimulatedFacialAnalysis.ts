import { useEffect, useRef, useState } from "react";
import type { FacialIndicators } from "../lib/api";
import type { FaceLandmarkPoint } from "../components/FaceMeshOverlay";

type SimulatedFacialAnalysis = {
  indicators: FacialIndicators | null;
  landmarks: FaceLandmarkPoint[] | null;
  isReady: boolean;
  error: null;
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function useSimulatedFacialAnalysis(
  enabled: boolean,
): SimulatedFacialAnalysis {
  const [indicators, setIndicators] = useState<FacialIndicators | null>(null);
  const [isReady, setIsReady] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIndicators(null);
      setIsReady(false);
      return;
    }

    const readyTimeout = window.setTimeout(() => setIsReady(true), 2000);

    intervalRef.current = window.setInterval(() => {
      const t = Date.now() / 1000;

      let eyeContact =
        0.78 + Math.sin(t * 0.4) * 0.09 + (Math.random() - 0.5) * 0.03;
      let headStability =
        0.85 + Math.sin(t * 0.25 + 1.2) * 0.08 + (Math.random() - 0.5) * 0.02;
      let facialActivity =
        0.38 + Math.sin(t * 0.9 + 0.7) * 0.12 + (Math.random() - 0.5) * 0.04;

      const dipPhase = t % 18;
      if (dipPhase < 1.6) {
        eyeContact = 0.42 + (Math.random() - 0.5) * 0.06;
      }

      eyeContact = clamp(eyeContact);
      headStability = clamp(headStability);
      facialActivity = clamp(facialActivity);

      setIndicators({
        eyeContactRatio: eyeContact,
        headStability,
        facialActivity,
      });
    }, 800);

    return () => {
      window.clearTimeout(readyTimeout);
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled]);

  return { indicators, landmarks: null, isReady, error: null };
}
