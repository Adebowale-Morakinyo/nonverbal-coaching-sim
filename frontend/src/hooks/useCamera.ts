import { RefObject, useEffect, useState } from "react";

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let mounted = true;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: "user" },
          audio: false,
        });

        if (mounted && videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setError("Camera unavailable");
      }
    }

    void startCamera();

    return () => {
      mounted = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [videoRef]);

  return { error };
}
