import { RefObject, useEffect, useRef, useState } from "react";
import FacialAnalysisWorker from "../workers/facialAnalysis.worker?worker";
import type { FacialIndicators } from "../lib/api";

type WorkerMessage =
  | { type: "ready" }
  | { type: "indicators"; data: FacialIndicators | null }
  | { type: "error"; message: string };

declare global {
  interface Window {
    __mediapipe_loaded?: boolean;
  }
}

export function useFacialAnalysis(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const [indicators, setIndicators] = useState<FacialIndicators | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readyRef = useRef(false);
  const workerBusyRef = useRef(false);
  const lastStateUpdateRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      readyRef.current = false;
      workerBusyRef.current = false;
      setIndicators(null);
      setIsReady(false);
      setError(null);
      return;
    }

    const worker = new FacialAnalysisWorker();
    let animationFrameID = 0;
    let stopped = false;

    async function captureFrame(timestamp: number) {
      if (stopped) {
        return;
      }

      const video = videoRef.current;
      if (
        readyRef.current &&
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !workerBusyRef.current
      ) {
        workerBusyRef.current = true;
        try {
          const imageBitmap = await createImageBitmap(video);
          worker.postMessage({ type: "frame", imageBitmap, timestamp }, [
            imageBitmap,
          ]);
        } catch (err) {
          workerBusyRef.current = false;
          setError(
            err instanceof Error ? err.message : "Unable to capture frame",
          );
        }
      }

      animationFrameID = requestAnimationFrame(captureFrame);
    }

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;

      if (message.type === "ready") {
        window.__mediapipe_loaded = true;
        readyRef.current = true;
        setIsReady(true);
        setError(null);
        return;
      }

      if (message.type === "error") {
        workerBusyRef.current = false;
        readyRef.current = false;
        setIsReady(false);
        setIndicators(null);
        setError(message.message);
        return;
      }

      if (message.type === "indicators") {
        workerBusyRef.current = false;
        const now = performance.now();
        if (now - lastStateUpdateRef.current >= 500) {
          lastStateUpdateRef.current = now;
          setIndicators(message.data);
        }
      }
    };

    worker.onerror = (event) => {
      workerBusyRef.current = false;
      readyRef.current = false;
      setIsReady(false);
      setIndicators(null);
      setError(event.message || "Facial analysis worker failed");
    };

    worker.postMessage({ type: "init" });
    animationFrameID = requestAnimationFrame(captureFrame);

    return () => {
      stopped = true;
      readyRef.current = false;
      workerBusyRef.current = false;
      if (animationFrameID) {
        cancelAnimationFrame(animationFrameID);
      }
      worker.terminate();
      setIndicators(null);
      setIsReady(false);
      setError(null);
    };
  }, [enabled, videoRef]);

  if (!enabled) {
    return { indicators: null, isReady: false, error: null };
  }

  return { indicators, isReady, error };
}
