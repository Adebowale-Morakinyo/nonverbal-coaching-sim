import { useEffect, useMemo } from "react";

export function useMediaPipeWorker() {
  const worker = useMemo(
    () =>
      new Worker(new URL("../workers/mediapipe.worker.ts", import.meta.url), {
        type: "module",
      }),
    [],
  );

  useEffect(() => {
    return () => worker.terminate();
  }, [worker]);

  return worker;
}
