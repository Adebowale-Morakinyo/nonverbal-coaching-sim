import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<{
    0: { transcript: string };
  }>;
};

type STTProvider = "webspeech" | "elevenlabs";

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const ELEVENLABS_STT_ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";
const ELEVENLABS_MAX_RECORDING_MS = 60_000;

function getProvider(): STTProvider {
  return import.meta.env.VITE_STT_PROVIDER === "elevenlabs"
    ? "elevenlabs"
    : "webspeech";
}

function getRecorderMimeType() {
  if (MediaRecorder.isTypeSupported("audio/webm")) {
    return "audio/webm";
  }
  if (MediaRecorder.isTypeSupported("audio/mp4")) {
    return "audio/mp4";
  }
  return "";
}

export function useSpeechInput(onTranscript: (text: string) => void) {
  const provider = getProvider();
  const [isRecording, setIsRecording] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const autoStopRef = useRef<number | null>(null);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    if (provider === "webspeech") {
      const available = Boolean(
        window.SpeechRecognition ?? window.webkitSpeechRecognition,
      );
      setIsAvailable(available);
      if (!available) {
        console.warn("SpeechRecognition is unavailable in this browser.");
      }
      return;
    }

    const hasRecorder = typeof MediaRecorder !== "undefined";
    const hasMediaDevices = Boolean(navigator.mediaDevices?.getUserMedia);
    const hasAPIKey = Boolean(import.meta.env.VITE_ELEVENLABS_API_KEY);
    const available = hasRecorder && hasMediaDevices && hasAPIKey;
    setIsAvailable(available);

    if (!available) {
      console.warn(
        "ElevenLabs speech-to-text is unavailable. Check MediaRecorder support, microphone access APIs, and VITE_ELEVENLABS_API_KEY.",
      );
    }
  }, [provider]);

  const cleanupElevenLabsRecording = useCallback(() => {
    if (autoStopRef.current) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const transcribeWithElevenLabs = useCallback(async (audioBlob: Blob) => {
    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
    if (!apiKey || audioBlob.size === 0) {
      onTranscriptRef.current("");
      return;
    }

    const formData = new FormData();
    formData.append("audio", audioBlob, "candidate-answer.webm");
    formData.append("model_id", "scribe_v1");

    try {
      const response = await fetch(ELEVENLABS_STT_ENDPOINT, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs STT failed with ${response.status}`);
      }

      const data = (await response.json()) as { text?: string };
      onTranscriptRef.current(data.text?.trim() ?? "");
    } catch (err) {
      console.warn("ElevenLabs transcription failed.", err);
      setError("Transcription failed — please type your answer");
      onTranscriptRef.current("");
    }
  }, []);

  const startWebSpeech = useCallback(() => {
    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      console.warn("SpeechRecognition is unavailable in this browser.");
      setIsAvailable(false);
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      onTranscriptRef.current(transcript);
    };
    recognition.onerror = (event) => {
      console.warn("SpeechRecognition failed.", event?.error);
      setIsRecording(false);
      setIsAvailable(false);
    };
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;

    try {
      recognition.start();
      setError(null);
      setIsRecording(true);
    } catch (err) {
      console.warn("SpeechRecognition could not start.", err);
      setIsRecording(false);
      setIsAvailable(false);
    }
  }, []);

  const startElevenLabs = useCallback(async () => {
    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
    if (
      !apiKey ||
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      console.warn(
        "ElevenLabs speech-to-text requires microphone APIs and VITE_ELEVENLABS_API_KEY.",
      );
      setIsAvailable(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getRecorderMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        setIsRecording(false);
        cleanupElevenLabsRecording();
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || "audio/webm",
        });
        audioChunksRef.current = [];
        void transcribeWithElevenLabs(audioBlob);
      };

      recorder.start();
      setError(null);
      setIsRecording(true);
      autoStopRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, ELEVENLABS_MAX_RECORDING_MS);
    } catch (err) {
      console.warn("Unable to start ElevenLabs speech recording.", err);
      cleanupElevenLabsRecording();
      setIsRecording(false);
      setIsAvailable(false);
    }
  }, [cleanupElevenLabsRecording, transcribeWithElevenLabs]);

  const startRecording = useCallback(() => {
    if (isRecording || !isAvailable) {
      return;
    }

    if (provider === "elevenlabs") {
      void startElevenLabs();
    } else {
      startWebSpeech();
    }
  }, [isAvailable, isRecording, provider, startElevenLabs, startWebSpeech]);

  const stopRecording = useCallback(() => {
    if (provider === "elevenlabs") {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    recognitionRef.current?.stop();
  }, [provider]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      cleanupElevenLabsRecording();
    };
  }, [cleanupElevenLabsRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording,
    isAvailable,
    error,
  };
}
