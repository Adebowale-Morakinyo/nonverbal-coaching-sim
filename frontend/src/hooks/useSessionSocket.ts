import { useCallback, useEffect, useRef, useState } from "react";
import type { FacialIndicators, SessionTurn } from "../lib/api";

export type Message = {
  id: string;
  role: "ai" | "candidate";
  content: string;
};

type SocketMessage =
  | { type: "ai_response"; content: string; turn_index?: number }
  | { type: "session_ended"; report: unknown }
  | { type: "facial_indicators"; data: FacialIndicators }
  | { type: "error"; error: string };

export function useSessionSocket(
  sessionId: string,
  initialTurns: SessionTurn[] = [],
) {
  const [messages, setMessages] = useState<Message[]>(() =>
    initialTurns.map((turn) => ({
      id: String(turn.id),
      role: turn.role,
      content: turn.content,
    })),
  );
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [facialData, setFacialData] = useState<FacialIndicators | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptedRef = useRef(false);

  useEffect(() => {
    setMessages(
      initialTurns.map((turn) => ({
        id: String(turn.id),
        role: turn.role,
        content: turn.content,
      })),
    );
  }, [initialTurns]);

  useEffect(() => {
    let closedByEffect = false;

    function connect() {
      setConnectionStatus("connecting");
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(
        `${protocol}://${window.location.host}/ws/${sessionId}`,
      );
      socketRef.current = socket;

      socket.onopen = () => {
        setConnectionStatus("connected");
        reconnectAttemptedRef.current = false;
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data) as SocketMessage;
        if (data.type === "ai_response") {
          setIsAiTyping(false);
          setMessages((current) => [
            ...current,
            {
              id: `ai-${data.turn_index ?? crypto.randomUUID()}`,
              role: "ai",
              content: data.content,
            },
          ]);
        }
        if (data.type === "session_ended") {
          setConnectionStatus("disconnected");
        }
        if (data.type === "facial_indicators") {
          setFacialData(data.data);
        }
        if (data.type === "error") {
          setIsAiTyping(false);
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        setConnectionStatus("disconnected");
        setIsAiTyping(false);
        if (!closedByEffect && !reconnectAttemptedRef.current) {
          reconnectAttemptedRef.current = true;
          window.setTimeout(connect, 600);
        }
      };
    }

    connect();

    return () => {
      closedByEffect = true;
      socketRef.current?.close();
    };
  }, [sessionId]);

  const sendTurn = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: `candidate-${crypto.randomUUID()}`,
        role: "candidate",
        content: trimmed,
      },
    ]);
    setIsAiTyping(true);

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({ type: "candidate_turn", content: trimmed }),
      );
      return;
    }

    window.setTimeout(() => {
      setIsAiTyping(false);
      setMessages((current) => [
        ...current,
        {
          id: `mock-ai-${crypto.randomUUID()}`,
          role: "ai",
          content:
            "Thank you. Could you give one specific example and explain the outcome?",
        },
      ]);
    }, 900);
  }, []);

  return {
    messages,
    isAiTyping,
    sendTurn,
    facialData,
    connectionStatus,
  };
}
