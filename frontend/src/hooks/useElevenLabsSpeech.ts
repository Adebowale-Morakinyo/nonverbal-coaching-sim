import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const TTS_MODEL = "eleven_turbo_v2";
const FALLBACK_TTS_MODEL = "eleven_monolingual_v1";
const MPEG_MIME_TYPE = "audio/mpeg";

function toArrayBuffer(chunk: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(chunk.byteLength);
  copy.set(chunk);
  return copy.buffer;
}

export function useElevenLabsSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const objectURLRef = useRef<string | null>(null);
  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined;
  const voiceID =
    (import.meta.env.VITE_ELEVENLABS_VOICE_ID as string | undefined) ??
    DEFAULT_VOICE_ID;

  const cleanupAudio = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    if (objectURLRef.current) {
      URL.revokeObjectURL(objectURLRef.current);
      objectURLRef.current = null;
    }
  }, []);

  const playBlob = useCallback(
    async (chunks: ArrayBuffer[]) => {
      if (chunks.length === 0) {
        setIsSpeaking(false);
        return;
      }

      const blob = new Blob(chunks, { type: MPEG_MIME_TYPE });
      const url = URL.createObjectURL(blob);
      objectURLRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        cleanupAudio();
        setIsSpeaking(false);
      };
      audio.onerror = () => {
        console.warn("ElevenLabs TTS playback failed, skipping audio");
        cleanupAudio();
        setIsSpeaking(false);
      };

      setIsSpeaking(true);
      await audio.play();
    },
    [cleanupAudio],
  );

  const playStream = useCallback(
    async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
      if (
        typeof MediaSource === "undefined" ||
        !MediaSource.isTypeSupported(MPEG_MIME_TYPE)
      ) {
        const chunks: ArrayBuffer[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          chunks.push(toArrayBuffer(value));
        }
        await playBlob(chunks);
        return;
      }

      const mediaSource = new MediaSource();
      const url = URL.createObjectURL(mediaSource);
      objectURLRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        cleanupAudio();
        setIsSpeaking(false);
      };
      audio.onerror = () => {
        console.warn("ElevenLabs TTS playback failed, skipping audio");
        cleanupAudio();
        setIsSpeaking(false);
      };

      await new Promise<void>((resolve, reject) => {
        mediaSource.addEventListener(
          "sourceopen",
          () => {
            try {
              const sourceBuffer = mediaSource.addSourceBuffer(MPEG_MIME_TYPE);
              let startedPlayback = false;

              async function appendChunk(chunk: Uint8Array) {
                await new Promise<void>((appendResolve, appendReject) => {
                  sourceBuffer.addEventListener(
                    "updateend",
                    () => appendResolve(),
                    { once: true },
                  );
                  sourceBuffer.addEventListener("error", () => appendReject(), {
                    once: true,
                  });
                  sourceBuffer.appendBuffer(toArrayBuffer(chunk));
                });

                if (!startedPlayback) {
                  startedPlayback = true;
                  setIsSpeaking(true);
                  await audio.play();
                }
              }

              async function pump() {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) {
                    break;
                  }
                  await appendChunk(value);
                }

                if (mediaSource.readyState === "open") {
                  mediaSource.endOfStream();
                }
                resolve();
              }

              void pump().catch(reject);
            } catch (err) {
              reject(err);
            }
          },
          { once: true },
        );
      });
    },
    [cleanupAudio, playBlob],
  );

  const speak = useCallback(
    async (text: string) => {
      if (!apiKey || !text.trim()) {
        return;
      }
      const key = apiKey;

      cleanupAudio();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        async function requestSpeech(modelID: string) {
          return fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceID}/stream`,
            {
              method: "POST",
              signal: controller.signal,
              headers: {
                "xi-api-key": key,
                "Content-Type": "application/json",
                Accept: MPEG_MIME_TYPE,
              },
              body: JSON.stringify({
                text,
                model_id: modelID,
                voice_settings: {
                  stability: 0.5,
                  similarity_boost: 0.75,
                },
              }),
            },
          );
        }

        let response = await requestSpeech(TTS_MODEL);
        if (
          !response.ok &&
          response.status !== 401 &&
          response.status !== 403 &&
          response.status !== 429
        ) {
          response = await requestSpeech(FALLBACK_TTS_MODEL);
        }

        if (!response.ok || !response.body) {
          console.warn("ElevenLabs TTS failed, skipping audio");
          return;
        }

        if (!controller.signal.aborted) {
          await playStream(response.body.getReader());
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.warn("ElevenLabs TTS failed, skipping audio", err);
          cleanupAudio();
          setIsSpeaking(false);
        }
      }
    },
    [apiKey, cleanupAudio, playStream, voiceID],
  );

  useEffect(() => {
    return () => cleanupAudio();
  }, [cleanupAudio]);

  return {
    speak,
    isSpeaking,
    hasVoiceConfigured: Boolean(apiKey),
    model: TTS_MODEL,
  };
}
