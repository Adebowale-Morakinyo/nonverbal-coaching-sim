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
    turnsToMessages(initialTurns),
  );
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [facialData, setFacialData] = useState<FacialIndicators | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "failed"
  >("connecting");
  const [connectionRun, setConnectionRun] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMessages(turnsToMessages(initialTurns));
  }, [initialTurns]);

  useEffect(() => {
    let closedByEffect = false;

    function connect() {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      setConnectionStatus("connecting");
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(
        `${protocol}://${window.location.host}/ws/${sessionId}`,
      );
      socketRef.current = socket;

      socket.onopen = () => {
        setConnectionStatus("connected");
        reconnectAttemptsRef.current = 0;
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data) as SocketMessage;

        if (data.type === "ai_response") {
          setIsAiTyping(false);
          const id = `ai-${data.turn_index ?? crypto.randomUUID()}`;
          setMessages((current) => [
            ...current.filter((message) => message.id !== id),
            { id, role: "ai", content: data.content },
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

        if (!closedByEffect && reconnectAttemptsRef.current < 3) {
          reconnectAttemptsRef.current += 1;
          reconnectTimerRef.current = window.setTimeout(connect, 800);
          return;
        }

        if (!closedByEffect) {
          setConnectionStatus("failed");
        }
      };

      socket.onerror = () => {
        setIsAiTyping(false);
      };
    }

    reconnectAttemptsRef.current = 0;
    connect();

    return () => {
      closedByEffect = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, [connectionRun, sessionId]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    setConnectionStatus("connecting");
    if (socketRef.current) {
      socketRef.current.close();
      return;
    }
    setConnectionRun((value) => value + 1);
  }, []);

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

    setIsAiTyping(false);
  }, []);

  return {
    messages,
    isAiTyping,
    sendTurn,
    facialData,
    connectionStatus,
    reconnect,
  };
}

function turnsToMessages(turns: SessionTurn[]): Message[] {
  return turns.map((turn) => ({
    id: String(turn.id),
    role: turn.role,
    content: turn.content,
  }));
}
