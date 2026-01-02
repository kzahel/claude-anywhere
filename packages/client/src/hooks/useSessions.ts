import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { type Project, type SessionSummary, toUrlProjectId } from "../types";
import {
  type FileChangeEvent,
  type ProcessStateEvent,
  type ProcessStateType,
  type SessionCreatedEvent,
  type SessionMetadataChangedEvent,
  type SessionSeenEvent,
  type SessionStatusEvent,
  useFileActivity,
} from "./useFileActivity";

const REFETCH_DEBOUNCE_MS = 500;

export function useSessions(projectId: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we've done the initial load (to preserve sort order on refetches)
  const hasInitialLoadRef = useRef(false);
  // Track which project we loaded so we can reset on project change
  const loadedProjectIdRef = useRef<string | undefined>(undefined);
  // Track process state (running/waiting-input) per session for activity indicators
  const [processStates, setProcessStates] = useState<
    Record<string, ProcessStateType>
  >({});

  const fetch = useCallback(async () => {
    if (!projectId) return;

    // Reset initial load flag when switching projects
    if (loadedProjectIdRef.current !== projectId) {
      hasInitialLoadRef.current = false;
      loadedProjectIdRef.current = projectId;
    }

    // Only show loading state on initial load, not on refetches
    setSessions((prev) => {
      if (prev.length === 0) setLoading(true);
      return prev;
    });
    setError(null);
    try {
      const data = await api.getProject(projectId);
      setProject(data.project);

      // Sync processStates from API response (fixes stale state after SSE reconnect)
      setProcessStates(() => {
        const newStates: Record<string, ProcessStateType> = {};
        for (const session of data.sessions) {
          if (session.processState) {
            newStates[session.id] = session.processState;
          }
        }
        return newStates;
      });

      // On initial load, use server's sort order. On refetches, preserve
      // existing order and only update session data in-place.
      if (!hasInitialLoadRef.current) {
        setSessions(data.sessions);
        hasInitialLoadRef.current = true;
      } else {
        setSessions((prev) => {
          // Build a map of new data for quick lookup
          const newDataMap = new Map(data.sessions.map((s) => [s.id, s]));

          // Update existing sessions in their current order
          const updated = prev.map((existing) => {
            const newData = newDataMap.get(existing.id);
            return newData ?? existing;
          });

          // Filter out sessions that no longer exist on server
          const existingIds = new Set(prev.map((s) => s.id));
          const filtered = updated.filter((s) => newDataMap.has(s.id));

          // Add any new sessions at the top (shouldn't happen often via refetch,
          // usually new sessions come via SSE, but handle it just in case)
          const newSessions = data.sessions.filter(
            (s) => !existingIds.has(s.id),
          );

          return [...newSessions, ...filtered];
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Debounced refetch for file change events
  const debouncedRefetch = useCallback(() => {
    if (refetchTimerRef.current) {
      clearTimeout(refetchTimerRef.current);
    }
    refetchTimerRef.current = setTimeout(() => {
      fetch();
    }, REFETCH_DEBOUNCE_MS);
  }, [fetch]);

  // Handle file change events
  const handleFileChange = useCallback(
    (event: FileChangeEvent) => {
      // Only care about session files
      if (event.fileType !== "session" && event.fileType !== "agent-session") {
        return;
      }

      // Extract session ID from the file path (e.g., "projects/xxx/session-id.jsonl" -> "session-id")
      const match = event.relativePath.match(/([^/\\]+)\.jsonl$/);
      const sessionId = match?.[1];
      if (!sessionId) return;

      // Check if this session is in our current list
      // This handles both internally managed sessions (by sessionId) and ensures
      // we refetch when any session in this project changes
      setSessions((prev) => {
        const sessionExists = prev.some((s) => s.id === sessionId);
        if (sessionExists) {
          // Trigger refetch for updates to existing sessions
          debouncedRefetch();
        }
        return prev;
      });
    },
    [debouncedRefetch],
  );

  // Handle session status changes (real-time updates without refetch)
  const handleSessionStatusChange = useCallback(
    (event: SessionStatusEvent) => {
      if (event.projectId !== projectId) return;

      setSessions((prev) =>
        prev.map((session) =>
          session.id === event.sessionId
            ? { ...session, status: event.status }
            : session,
        ),
      );

      // Clear process state and pendingInputType when session goes idle (no longer has a process)
      if (event.status.state === "idle") {
        setProcessStates((prev) => {
          const { [event.sessionId]: _, ...rest } = prev;
          return rest;
        });
        // Also clear pendingInputType since the process is gone
        setSessions((prev) =>
          prev.map((session) =>
            session.id === event.sessionId
              ? {
                  ...session,
                  pendingInputType: undefined,
                  processState: undefined,
                }
              : session,
          ),
        );
      }
    },
    [projectId],
  );

  // Handle process state changes (running/waiting-input)
  const handleProcessStateChange = useCallback(
    (event: ProcessStateEvent) => {
      if (event.projectId !== projectId) return;

      setProcessStates((prev) => ({
        ...prev,
        [event.sessionId]: event.processState,
      }));

      // When state changes to "running", clear pendingInputType since input was resolved
      // This fixes the "approval needed" badge getting stuck after approval
      if (event.processState === "running") {
        setSessions((prev) =>
          prev.map((session) =>
            session.id === event.sessionId
              ? { ...session, pendingInputType: undefined }
              : session,
          ),
        );
      }
    },
    [projectId],
  );

  // Handle new session created (instant add without refetch)
  const handleSessionCreated = useCallback(
    (event: SessionCreatedEvent) => {
      // Only care about sessions in our project
      if (event.session.projectId !== projectId) return;

      setSessions((prev) => {
        // Check for duplicates (session might already exist from race condition)
        if (prev.some((s) => s.id === event.session.id)) {
          return prev;
        }

        // Add new session at the beginning (most recent first)
        return [event.session, ...prev];
      });
    },
    [projectId],
  );

  // Handle session metadata changes (title, archived, starred)
  const handleSessionMetadataChange = useCallback(
    (event: SessionMetadataChangedEvent) => {
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== event.sessionId) return session;

          // Update the session with changed metadata
          return {
            ...session,
            ...(event.title !== undefined && { customTitle: event.title }),
            ...(event.archived !== undefined && { isArchived: event.archived }),
            ...(event.starred !== undefined && { isStarred: event.starred }),
          };
        }),
      );
    },
    [],
  );

  // Handle session seen events (marks session as read)
  const handleSessionSeen = useCallback((event: SessionSeenEvent) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== event.sessionId) return session;

        // Update lastSeenAt and clear hasUnread
        // hasUnread will be false since we're marking the current timestamp as seen
        return {
          ...session,
          lastSeenAt: event.timestamp,
          hasUnread: false,
        };
      }),
    );
  }, []);

  // Subscribe to file activity, status changes, session creation, and process state
  useFileActivity({
    onFileChange: handleFileChange,
    onSessionStatusChange: handleSessionStatusChange,
    onSessionCreated: handleSessionCreated,
    onProcessStateChange: handleProcessStateChange,
    onSessionMetadataChange: handleSessionMetadataChange,
    onSessionSeen: handleSessionSeen,
    onReconnect: fetch, // Refetch to sync state after SSE reconnection
  });

  // Initial fetch
  useEffect(() => {
    fetch();
  }, [fetch]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current);
      }
    };
  }, []);

  // Add an optimistic session (used when creating a new session before SSE event arrives)
  const addOptimisticSession = useCallback(
    (sessionId: string, title: string) => {
      if (!projectId) return;

      const now = new Date().toISOString();
      const optimisticSession: SessionSummary = {
        id: sessionId,
        projectId: toUrlProjectId(projectId),
        title,
        fullTitle: title,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        status: { state: "idle" },
      };

      setSessions((prev) => {
        // Don't add if already exists
        if (prev.some((s) => s.id === sessionId)) return prev;
        return [optimisticSession, ...prev];
      });
    },
    [projectId],
  );

  return {
    project,
    sessions,
    loading,
    error,
    refetch: fetch,
    processStates,
    addOptimisticSession,
  };
}
