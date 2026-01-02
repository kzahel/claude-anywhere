import type { ProcessStateType, UrlProjectId } from "@claude-anywhere/shared";
import type { SessionStatus, SessionSummary } from "../types";

// Event types matching what the server emits
export type FileChangeType = "create" | "modify" | "delete";
export type FileType =
  | "session"
  | "agent-session"
  | "settings"
  | "credentials"
  | "telemetry"
  | "other";

export interface FileChangeEvent {
  type: "file-change";
  path: string;
  relativePath: string;
  changeType: FileChangeType;
  timestamp: string;
  fileType: FileType;
}

export interface SessionStatusEvent {
  type: "session-status-changed";
  sessionId: string;
  projectId: UrlProjectId;
  status: SessionStatus;
  timestamp: string;
}

export interface SessionCreatedEvent {
  type: "session-created";
  session: SessionSummary;
  timestamp: string;
}

export interface SessionSeenEvent {
  type: "session-seen";
  sessionId: string;
  timestamp: string;
  messageId?: string;
}

export interface ProcessStateEvent {
  type: "process-state-changed";
  sessionId: string;
  projectId: UrlProjectId;
  processState: ProcessStateType;
  timestamp: string;
}

export interface SessionMetadataChangedEvent {
  type: "session-metadata-changed";
  sessionId: string;
  title?: string;
  archived?: boolean;
  starred?: boolean;
  timestamp: string;
}

// Dev mode events
export interface SourceChangeEvent {
  type: "source-change";
  target: "backend" | "frontend";
  files: string[];
  timestamp: string;
}

export interface WorkerActivityEvent {
  type: "worker-activity-changed";
  activeWorkers: number;
  queueLength: number;
  hasActiveWork: boolean;
  timestamp: string;
}

// Map event names to their data types
interface ActivityEventMap {
  "file-change": FileChangeEvent;
  "session-status-changed": SessionStatusEvent;
  "session-created": SessionCreatedEvent;
  "session-seen": SessionSeenEvent;
  "process-state-changed": ProcessStateEvent;
  "session-metadata-changed": SessionMetadataChangedEvent;
  // Dev mode events
  "source-change": SourceChangeEvent;
  "backend-reloaded": undefined;
  "worker-activity-changed": WorkerActivityEvent;
  reconnect: undefined;
}

export type ActivityEventType = keyof ActivityEventMap;

type Listener<T> = (data: T) => void;

const API_BASE = "/api";
const RECONNECT_DELAY_MS = 2000;

/**
 * Singleton that manages a single SSE connection to /api/activity/stream.
 * Hooks subscribe via on() and receive events through callbacks.
 */
class ActivityBus {
  private eventSource: EventSource | null = null;
  private listeners = new Map<ActivityEventType, Set<Listener<unknown>>>();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private hasConnected = false;
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  /**
   * Connect to the SSE stream. Safe to call multiple times.
   */
  connect(): void {
    if (this.eventSource) return;

    const es = new EventSource(`${API_BASE}/activity/stream`);

    es.onopen = () => {
      const isReconnect = this.hasConnected;
      this.hasConnected = true;
      this._connected = true;

      if (isReconnect) {
        this.emit("reconnect", undefined);
      }
    };

    // Set up event listeners for each event type
    es.addEventListener("file-change", (event) =>
      this.handleEvent("file-change", event),
    );
    es.addEventListener("session-status-changed", (event) =>
      this.handleEvent("session-status-changed", event),
    );
    es.addEventListener("session-created", (event) =>
      this.handleEvent("session-created", event),
    );
    es.addEventListener("session-seen", (event) =>
      this.handleEvent("session-seen", event),
    );
    es.addEventListener("process-state-changed", (event) =>
      this.handleEvent("process-state-changed", event),
    );
    es.addEventListener("session-metadata-changed", (event) =>
      this.handleEvent("session-metadata-changed", event),
    );

    // Dev mode events
    es.addEventListener("source-change", (event) =>
      this.handleEvent("source-change", event),
    );
    es.addEventListener("backend-reloaded", () =>
      this.emit("backend-reloaded", undefined),
    );
    es.addEventListener("worker-activity-changed", (event) =>
      this.handleEvent("worker-activity-changed", event),
    );

    // Ignore these - just acknowledge receipt
    es.addEventListener("connected", () => {});
    es.addEventListener("heartbeat", () => {});

    es.onerror = () => {
      this._connected = false;
      es.close();
      this.eventSource = null;

      // Auto-reconnect
      this.reconnectTimeout = setTimeout(
        () => this.connect(),
        RECONNECT_DELAY_MS,
      );
    };

    this.eventSource = es;
  }

  /**
   * Disconnect from the SSE stream.
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this._connected = false;
  }

  /**
   * Subscribe to an event type. Returns an unsubscribe function.
   */
  on<K extends ActivityEventType>(
    eventType: K,
    callback: Listener<ActivityEventMap[K]>,
  ): () => void {
    let set = this.listeners.get(eventType);
    if (!set) {
      set = new Set();
      this.listeners.set(eventType, set);
    }
    set.add(callback as Listener<unknown>);

    return () => {
      set.delete(callback as Listener<unknown>);
    };
  }

  private handleEvent(eventType: ActivityEventType, event: MessageEvent): void {
    if (event.data === undefined || event.data === null) return;

    try {
      const data = JSON.parse(event.data);
      this.emit(eventType, data);
    } catch {
      // Ignore malformed JSON
    }
  }

  private emit<K extends ActivityEventType>(
    eventType: K,
    data: ActivityEventMap[K],
  ): void {
    const set = this.listeners.get(eventType);
    if (set) {
      for (const listener of set) {
        listener(data);
      }
    }
  }
}

export const activityBus = new ActivityBus();
