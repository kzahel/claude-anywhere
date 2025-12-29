/**
 * Simple in-memory pub/sub event bus for file change and session status events.
 */

import type { SessionStatus } from "../supervisor/types.js";

export type FileChangeType = "create" | "modify" | "delete";

export interface FileChangeEvent {
  type: "file-change";
  path: string;
  relativePath: string;
  changeType: FileChangeType;
  timestamp: string;
  /** Parsed file type based on path */
  fileType:
    | "session"
    | "agent-session"
    | "settings"
    | "credentials"
    | "telemetry"
    | "other";
}

export interface SessionStatusEvent {
  type: "session-status-changed";
  sessionId: string;
  projectId: string;
  status: SessionStatus;
  timestamp: string;
}

/** Union of all event types that can be emitted through the bus */
export type BusEvent = FileChangeEvent | SessionStatusEvent;

export type EventHandler<T = BusEvent> = (event: T) => void;

export class EventBus {
  private subscribers: Set<EventHandler> = new Set();

  /**
   * Subscribe to bus events.
   * @returns Unsubscribe function
   */
  subscribe(handler: EventHandler): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  /**
   * Emit an event to all subscribers.
   */
  emit(event: BusEvent): void {
    for (const handler of this.subscribers) {
      try {
        handler(event);
      } catch (error) {
        console.error("[EventBus] Handler error:", error);
      }
    }
  }

  /**
   * Get the number of active subscribers.
   */
  get subscriberCount(): number {
    return this.subscribers.size;
  }
}
