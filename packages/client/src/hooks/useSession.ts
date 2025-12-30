import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { Message, PermissionMode, Session, SessionStatus } from "../types";
import {
  type FileChangeEvent,
  type SessionStatusEvent,
  useFileActivity,
} from "./useFileActivity";
import { useSSE } from "./useSSE";

export type ProcessState = "idle" | "running" | "waiting-input";

const THROTTLE_MS = 500;

export function useSession(projectId: string, sessionId: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<SessionStatus>({ state: "idle" });
  const [processState, setProcessState] = useState<ProcessState>("idle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Permission mode state and version tracking for multi-tab sync
  const [permissionMode, setPermissionModeState] =
    useState<PermissionMode>("default");
  const [modeVersion, setModeVersion] = useState<number>(0);
  const lastKnownModeVersionRef = useRef<number>(0);

  // Update permission mode and track the version for race condition handling
  const setPermissionMode = useCallback((mode: PermissionMode) => {
    setPermissionModeState(mode);
  }, []);

  // Apply server mode update only if version is >= our last known version
  const applyServerModeUpdate = useCallback(
    (mode: PermissionMode, version: number) => {
      if (version >= lastKnownModeVersionRef.current) {
        lastKnownModeVersionRef.current = version;
        setPermissionModeState(mode);
        setModeVersion(version);
      }
    },
    [],
  );

  // Throttle state for incremental fetching
  const throttleRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    pending: boolean;
  }>({ timer: null, pending: false });

  // Track last message ID for incremental fetching
  const lastMessageIdRef = useRef<string | undefined>(undefined);

  // Add user message optimistically with a temp ID
  const addUserMessage = useCallback((text: string) => {
    const tempId = `temp-${Date.now()}`;
    const msg: Message = {
      id: tempId,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Update lastMessageIdRef when messages change
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      lastMessageIdRef.current = lastMessage.id;
    }
  }, [messages]);

  // Load initial data
  useEffect(() => {
    setLoading(true);
    api
      .getSession(projectId, sessionId)
      .then((data) => {
        setSession(data.session);
        setMessages(data.messages);
        setStatus(data.status);
        // Sync permission mode from server if owned
        if (
          data.status.state === "owned" &&
          data.status.permissionMode &&
          data.status.modeVersion !== undefined
        ) {
          applyServerModeUpdate(
            data.status.permissionMode,
            data.status.modeVersion,
          );
        }
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [projectId, sessionId, applyServerModeUpdate]);

  // Fetch only new messages (incremental update)
  const fetchNewMessages = useCallback(async () => {
    try {
      const data = await api.getSession(
        projectId,
        sessionId,
        lastMessageIdRef.current,
      );
      if (data.messages.length > 0) {
        setMessages((prev) => [...prev, ...data.messages]);
      }
      setStatus(data.status);
    } catch {
      // Silent fail for incremental updates
    }
  }, [projectId, sessionId]);

  // Leading + trailing edge throttle:
  // - Leading: fires immediately on first call
  // - Trailing: fires again after timeout if events came during window
  // This ensures no updates are lost
  const throttledFetch = useCallback(() => {
    const ref = throttleRef.current;

    if (!ref.timer) {
      // No active throttle - fire immediately (LEADING EDGE)
      fetchNewMessages();
      ref.timer = setTimeout(() => {
        ref.timer = null;
        if (ref.pending) {
          ref.pending = false;
          throttledFetch(); // Fire again (TRAILING EDGE)
        }
      }, THROTTLE_MS);
    } else {
      // Throttled - mark as pending for trailing edge
      ref.pending = true;
    }
  }, [fetchNewMessages]);

  // Handle file changes for external sessions
  const handleFileChange = useCallback(
    (event: FileChangeEvent) => {
      // Only care about session files
      if (event.fileType !== "session" && event.fileType !== "agent-session") {
        return;
      }

      // Check if file matches current session
      if (!event.relativePath.includes(sessionId)) {
        return;
      }

      // Skip if we own the session (we get updates via SSE stream)
      if (status.state === "owned") {
        return;
      }

      // Throttled refetch for external sessions
      throttledFetch();
    },
    [sessionId, status.state, throttledFetch],
  );

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
    onFileChange: handleFileChange,
  });

  // Cleanup throttle timer
  useEffect(() => {
    return () => {
      if (throttleRef.current.timer) {
        clearTimeout(throttleRef.current.timer);
      }
    };
  }, []);

  // Subscribe to live updates
  const handleSSEMessage = useCallback(
    (data: { eventType: string; [key: string]: unknown }) => {
      if (data.eventType === "message") {
        // The message event contains the SDK message directly
        // We need to convert it to our Message format
        const sdkMessage = data as {
          eventType: string;
          type: string;
          uuid?: string;
          message?: { content: string; role?: string };
        };
        if (sdkMessage.message) {
          const role =
            (sdkMessage.message.role as Message["role"]) || "assistant";
          const id = sdkMessage.uuid ?? `msg-${Date.now()}`;
          const content = sdkMessage.message.content;

          setMessages((prev) => {
            // For user messages, check if we have a temp message with same content
            if (role === "user") {
              const tempIdx = prev.findIndex(
                (m) =>
                  m.id.startsWith("temp-") &&
                  m.role === "user" &&
                  m.content === content,
              );
              if (tempIdx >= 0) {
                // Replace temp message with authoritative one (real UUID)
                const updated = [...prev];
                const existing = updated[tempIdx];
                if (existing) {
                  updated[tempIdx] = {
                    id,
                    role: existing.role,
                    content: existing.content,
                    timestamp: existing.timestamp,
                  };
                }
                return updated;
              }
            }
            // Otherwise add new message
            return [
              ...prev,
              {
                id,
                role,
                content,
                timestamp: new Date().toISOString(),
              },
            ];
          });
        }
      } else if (data.eventType === "status") {
        const statusData = data as { eventType: string; state: string };
        // Track process state (running, idle, waiting-input)
        if (
          statusData.state === "idle" ||
          statusData.state === "running" ||
          statusData.state === "waiting-input"
        ) {
          setProcessState(statusData.state as ProcessState);
        }
        if (statusData.state === "idle") {
          setStatus({ state: "idle" });
        }
      } else if (data.eventType === "complete") {
        setProcessState("idle");
        setStatus({ state: "idle" });
      } else if (data.eventType === "connected") {
        // Sync permission mode from connected event
        const connectedData = data as {
          eventType: string;
          permissionMode?: PermissionMode;
          modeVersion?: number;
        };
        if (
          connectedData.permissionMode &&
          connectedData.modeVersion !== undefined
        ) {
          applyServerModeUpdate(
            connectedData.permissionMode,
            connectedData.modeVersion,
          );
        }
      } else if (data.eventType === "mode-change") {
        // Handle mode change from another tab/client
        const modeData = data as {
          eventType: string;
          permissionMode?: PermissionMode;
          modeVersion?: number;
        };
        if (modeData.permissionMode && modeData.modeVersion !== undefined) {
          applyServerModeUpdate(modeData.permissionMode, modeData.modeVersion);
        }
      }
    },
    [applyServerModeUpdate],
  );

  // Only connect to session stream when we own the session
  // External sessions are tracked via the activity stream instead
  const { connected } = useSSE(
    status.state === "owned" ? `/api/sessions/${sessionId}/stream` : null,
    { onMessage: handleSSEMessage },
  );

  return {
    session,
    messages,
    status,
    processState,
    permissionMode,
    modeVersion,
    loading,
    error,
    connected,
    setStatus,
    setProcessState,
    setPermissionMode,
    addUserMessage,
  };
}
