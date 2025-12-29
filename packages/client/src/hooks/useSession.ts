import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Message, Session, SessionStatus } from "../types";
import { type SessionStatusEvent, useFileActivity } from "./useFileActivity";
import { useSSE } from "./useSSE";

export function useSession(projectId: string, sessionId: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<SessionStatus>({ state: "idle" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load initial data
  useEffect(() => {
    setLoading(true);
    api
      .getSession(projectId, sessionId)
      .then((data) => {
        setSession(data.session);
        setMessages(data.messages);
        setStatus(data.status);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [projectId, sessionId]);

  // Listen for session status changes via SSE
  const handleSessionStatusChange = useCallback(
    (event: SessionStatusEvent) => {
      if (event.sessionId === sessionId) {
        setStatus(event.status);
      }
    },
    [sessionId],
  );

  useFileActivity({
    onSessionStatusChange: handleSessionStatusChange,
  });

  // Subscribe to live updates
  const handleSSEMessage = useCallback(
    (data: { eventType: string; [key: string]: unknown }) => {
      if (data.eventType === "message") {
        // The message event contains the SDK message directly
        // We need to convert it to our Message format
        const sdkMessage = data as {
          eventType: string;
          type: string;
          message?: { content: string; role?: string };
        };
        if (sdkMessage.message) {
          const msg: Message = {
            id: `msg-${Date.now()}`,
            role: (sdkMessage.message.role as Message["role"]) || "assistant",
            content: sdkMessage.message.content,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, msg]);
        }
      } else if (data.eventType === "status") {
        const statusData = data as { eventType: string; state: string };
        if (statusData.state === "idle") {
          setStatus({ state: "idle" });
        }
      } else if (data.eventType === "complete") {
        setStatus({ state: "idle" });
      }
    },
    [],
  );

  // Only connect to session stream when we own the session
  // External sessions are tracked via the activity stream instead
  const { connected } = useSSE(
    status.state === "owned" ? `/api/sessions/${sessionId}/stream` : null,
    { onMessage: handleSSEMessage },
  );

  return { session, messages, status, loading, error, connected, setStatus };
}
