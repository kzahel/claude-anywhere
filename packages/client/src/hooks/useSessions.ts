import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { extractSessionIdFromFileEvent } from "../lib/sessionFile";
import type { Project, SessionSummary } from "../types";
import { toUrlProjectId } from "../utils";
import {
  type FileChangeEvent,
  type ProcessStateEvent,
  type ProcessStateType,
  type SessionCreatedEvent,
  type SessionMetadataChangedEvent,
  type SessionSeenEvent,
  type SessionStatusEvent,
  type SessionUpdatedEvent,
  useFileActivity,
} from "./useFileActivity";

const REFETCH_DEBOUNCE_MS = 500;
const SESSION_REFETCH_DEBOUNCE_MS = 200;

export function useSessions(projectId: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track pending session-specific refetch timers (sessionId -> timer)
  const sessionRefetchTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  // Track whether we've done the initial load (to preserve sort order on refetches)
  const hasInitialLoadRef = useRef(false);
  // Track which project we loaded so we can reset on project change
  const loadedProjectIdRef = useRef<string | undefined>(undefined);
  // Track sessions in a ref so callbacks can read current state without depending on it
  const sessionsRef = useRef<SessionSummary[]>([]);
  sessionsRef.current = sessions;
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
    // Use sessionsRef to check without depending on sessions state
    if (sessionsRef.current.length === 0) {
      setLoading(true);
    }
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

  // Fetch a single session's metadata and update it in place (lightweight alternative to full refetch)
  const refetchSessionMetadata = useCallback(
    async (sessionId: string) => {
      if (!projectId) return;

      try {
        const data = await api.getSessionMetadata(projectId, sessionId);

        // Convert InputRequest.type to PendingInputType
        // "tool-approval" stays as-is, "question" or "choice" becomes "user-question"
        const pendingInputType = data.pendingInputRequest
          ? data.pendingInputRequest.type === "tool-approval"
            ? ("tool-approval" as const)
            : ("user-question" as const)
          : undefined;

        setSessions((prev) =>
          prev.map((session) => {
            if (session.id !== sessionId) return session;
            // Update the session with fresh metadata
            return {
              ...session,
              title: data.session.title,
              fullTitle: data.session.fullTitle,
              customTitle: data.session.customTitle,
              updatedAt: data.session.updatedAt,
              status: data.status,
              pendingInputType,
              isArchived: data.session.isArchived,
              isStarred: data.session.isStarred,
              lastSeenAt: data.session.lastSeenAt,
              hasUnread: data.session.hasUnread,
            };
          }),
        );
        // Update process state based on session status
        if (data.status.state === "owned") {
          // Session has a running process - we don't know exact state from metadata alone
          // but we can clear it if status goes to idle
        } else if (data.status.state === "idle") {
          setProcessStates((prev) => {
            const { [sessionId]: _, ...rest } = prev;
            return rest;
          });
        }
      } catch {
        // Silently fail - session might have been deleted
      }
    },
    [projectId],
  );

  // Debounced session-specific refetch
  const debouncedRefetchSession = useCallback(
    (sessionId: string) => {
      const existing = sessionRefetchTimersRef.current.get(sessionId);
      if (existing) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        sessionRefetchTimersRef.current.delete(sessionId);
        refetchSessionMetadata(sessionId);
      }, SESSION_REFETCH_DEBOUNCE_MS);
      sessionRefetchTimersRef.current.set(sessionId, timer);
    },
    [refetchSessionMetadata],
  );

  // Handle file change events
  // NOTE: Most session state updates come through dedicated SSE events now:
  // - session-updated: title, messageCount, updatedAt
  // - session-metadata-changed: customTitle, archived, starred
  // - session-status-changed: status
  // - process-state-changed: processState, pendingInputType
  // - session-seen: lastSeenAt, hasUnread
  //
  // We only need to fetch metadata for NEW sessions (session-created event fires)
  // or on reconnect (onReconnect handler). File changes are now handled by SSE.
  const handleFileChange = useCallback(
    (event: FileChangeEvent) => {
      // Only care about new session files
      if (event.fileType !== "session" && event.fileType !== "agent-session") {
        return;
      }
      if (event.changeType !== "create") {
        // Modifications are handled by session-updated SSE event
        return;
      }

      // Extract session ID from the file path
      const sessionId = extractSessionIdFromFileEvent(event);
      if (!sessionId) return;

      // Check if this is a new session we don't know about yet
      // (session-created event should have handled this, but this is a fallback)
      const sessionExists = sessionsRef.current.some((s) => s.id === sessionId);
      if (!sessionExists) {
        // New session - trigger a full refetch to pick it up
        debouncedRefetch();
      }
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

      // Update pendingInputType based on process state
      if (event.processState === "waiting-input" && event.pendingInputType) {
        // Set pendingInputType from SSE event (no API call needed)
        setSessions((prev) =>
          prev.map((session) =>
            session.id === event.sessionId
              ? { ...session, pendingInputType: event.pendingInputType }
              : session,
          ),
        );
      } else if (event.processState === "running") {
        // When state changes to "running", clear pendingInputType since input was resolved
        // This fixes the "approval needed" badge getting stuck after approval
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

  // Handle session content updates (auto-generated title, messageCount)
  const handleSessionUpdated = useCallback(
    (event: SessionUpdatedEvent) => {
      // Only handle events for our project
      if (event.projectId !== projectId) return;

      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== event.sessionId) return session;

          return {
            ...session,
            ...(event.title !== undefined && { title: event.title }),
            ...(event.messageCount !== undefined && {
              messageCount: event.messageCount,
            }),
            ...(event.updatedAt !== undefined && {
              updatedAt: event.updatedAt,
            }),
          };
        }),
      );
    },
    [projectId],
  );

  // Subscribe to file activity, status changes, session creation, and process state
  useFileActivity({
    onFileChange: handleFileChange,
    onSessionStatusChange: handleSessionStatusChange,
    onSessionCreated: handleSessionCreated,
    onProcessStateChange: handleProcessStateChange,
    onSessionMetadataChange: handleSessionMetadataChange,
    onSessionSeen: handleSessionSeen,
    onSessionUpdated: handleSessionUpdated,
    onReconnect: fetch, // Refetch to sync state after SSE reconnection
  });

  // Initial fetch
  useEffect(() => {
    fetch();
  }, [fetch]);

  // Cleanup debounce timers
  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current);
      }
      for (const timer of sessionRefetchTimersRef.current.values()) {
        clearTimeout(timer);
      }
      sessionRefetchTimersRef.current.clear();
    };
  }, []);

  return {
    project,
    sessions,
    loading,
    error,
    refetch: fetch,
    processStates,
  };
}
