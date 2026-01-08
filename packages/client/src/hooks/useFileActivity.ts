import { useCallback, useEffect, useRef, useState } from "react";
import {
  type FileChangeEvent,
  type FileType,
  type ProcessStateEvent,
  type SessionCreatedEvent,
  type SessionMetadataChangedEvent,
  type SessionSeenEvent,
  type SessionStatusEvent,
  type SessionUpdatedEvent,
  activityBus,
} from "../lib/activityBus";

// Re-export types for consumers
export type { ProcessStateType } from "@yep-anywhere/shared";
export type {
  FileChangeEvent,
  FileChangeType,
  FileType,
  ProcessStateEvent,
  SessionCreatedEvent,
  SessionMetadataChangedEvent,
  SessionSeenEvent,
  SessionStatusEvent,
  SessionUpdatedEvent,
} from "../lib/activityBus";

interface UseFileActivityOptions {
  /** Maximum number of events to keep in buffer (default: 500) */
  maxEvents?: number;
  /** Whether to connect on mount (default: true) - ignored, bus is always connected */
  autoConnect?: boolean;
  /** Callback when a file change occurs */
  onFileChange?: (event: FileChangeEvent) => void;
  /** Callback when a session status changes */
  onSessionStatusChange?: (event: SessionStatusEvent) => void;
  /** Callback when a new session is created */
  onSessionCreated?: (event: SessionCreatedEvent) => void;
  /** Callback when a session is marked as seen (from another tab/device) */
  onSessionSeen?: (event: SessionSeenEvent) => void;
  /** Callback when a process state changes (running/waiting-input) */
  onProcessStateChange?: (event: ProcessStateEvent) => void;
  /** Callback when session metadata changes (title, archived, starred) */
  onSessionMetadataChange?: (event: SessionMetadataChangedEvent) => void;
  /** Callback when session content changes (auto-generated title, messageCount) */
  onSessionUpdated?: (event: SessionUpdatedEvent) => void;
  /** Callback when SSE connection is re-established after being disconnected */
  onReconnect?: () => void;
}

const DEFAULT_MAX_EVENTS = 500;

/**
 * Hook to subscribe to activity events from the global activityBus.
 * The bus manages a single SSE connection shared by all hook instances.
 */
export function useFileActivity(options: UseFileActivityOptions = {}) {
  const {
    maxEvents = DEFAULT_MAX_EVENTS,
    onFileChange,
    onSessionStatusChange,
    onSessionCreated,
    onSessionSeen,
    onProcessStateChange,
    onSessionMetadataChange,
    onSessionUpdated,
    onReconnect,
  } = options;

  // Local state for this hook instance
  const [events, setEvents] = useState<FileChangeEvent[]>([]);
  const [connected, setConnected] = useState(activityBus.connected);
  const [paused, setPaused] = useState(false);

  // Use refs to avoid stale closures in callbacks
  const onFileChangeRef = useRef(onFileChange);
  onFileChangeRef.current = onFileChange;
  const onSessionStatusChangeRef = useRef(onSessionStatusChange);
  onSessionStatusChangeRef.current = onSessionStatusChange;
  const onSessionCreatedRef = useRef(onSessionCreated);
  onSessionCreatedRef.current = onSessionCreated;
  const onSessionSeenRef = useRef(onSessionSeen);
  onSessionSeenRef.current = onSessionSeen;
  const onProcessStateChangeRef = useRef(onProcessStateChange);
  onProcessStateChangeRef.current = onProcessStateChange;
  const onSessionMetadataChangeRef = useRef(onSessionMetadataChange);
  onSessionMetadataChangeRef.current = onSessionMetadataChange;
  const onSessionUpdatedRef = useRef(onSessionUpdated);
  onSessionUpdatedRef.current = onSessionUpdated;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;
  const maxEventsRef = useRef(maxEvents);
  maxEventsRef.current = maxEvents;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Subscribe to all events from the bus
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // File change - buffer events and call callback
    unsubscribers.push(
      activityBus.on("file-change", (data) => {
        onFileChangeRef.current?.(data);

        // Add to events buffer (unless paused)
        if (!pausedRef.current) {
          setEvents((prev) => {
            const next = [data, ...prev];
            return next.slice(0, maxEventsRef.current);
          });
        }
      }),
    );

    // Other events - just call callbacks
    unsubscribers.push(
      activityBus.on("session-status-changed", (data) => {
        onSessionStatusChangeRef.current?.(data);
      }),
    );

    unsubscribers.push(
      activityBus.on("session-created", (data) => {
        onSessionCreatedRef.current?.(data);
      }),
    );

    unsubscribers.push(
      activityBus.on("session-seen", (data) => {
        onSessionSeenRef.current?.(data);
      }),
    );

    unsubscribers.push(
      activityBus.on("process-state-changed", (data) => {
        onProcessStateChangeRef.current?.(data);
      }),
    );

    unsubscribers.push(
      activityBus.on("session-metadata-changed", (data) => {
        onSessionMetadataChangeRef.current?.(data);
      }),
    );

    unsubscribers.push(
      activityBus.on("session-updated", (data) => {
        onSessionUpdatedRef.current?.(data);
      }),
    );

    // Reconnect - update connected state and call callback
    unsubscribers.push(
      activityBus.on("reconnect", () => {
        setConnected(true);
        onReconnectRef.current?.();
      }),
    );

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, []);

  // Sync connected state with bus (for initial render and disconnects)
  useEffect(() => {
    const checkConnection = () => {
      setConnected(activityBus.connected);
    };

    // Check periodically since we don't have a disconnect event
    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const togglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  // Filter helpers
  const filterByPath = useCallback(
    (pattern: string) => {
      const regex = new RegExp(pattern, "i");
      return events.filter((e) => regex.test(e.relativePath));
    },
    [events],
  );

  const filterByType = useCallback(
    (fileType: FileType) => {
      return events.filter((e) => e.fileType === fileType);
    },
    [events],
  );

  // Keep connect/disconnect for backward compatibility (they're no-ops now)
  const connect = useCallback(() => {
    // No-op - bus is always connected via main.tsx
  }, []);

  const disconnect = useCallback(() => {
    // No-op - bus manages connection lifecycle
  }, []);

  return {
    events,
    connected,
    paused,
    connect,
    disconnect,
    clearEvents,
    togglePause,
    filterByPath,
    filterByType,
  };
}
