import * as path from "node:path";
import type {
  BusEvent,
  EventBus,
  FileChangeEvent,
  SessionStatusEvent,
} from "../watcher/EventBus.js";
import type { Supervisor } from "./Supervisor.js";
import type { SessionStatus } from "./types.js";

interface ExternalSessionInfo {
  detectedAt: Date;
  lastActivity: Date;
  projectId: string;
  timeoutId: ReturnType<typeof setTimeout>;
}

export interface ExternalSessionTrackerOptions {
  eventBus: EventBus;
  supervisor: Supervisor;
  /** Time in ms before external status decays to idle (default: 30000) */
  decayMs?: number;
}

/**
 * Tracks sessions that are being modified by external programs (not owned by this app).
 *
 * Uses file change events to detect when a session file is modified, then checks
 * if we own that session via Supervisor. If not owned, marks as "external" until
 * the decay timeout passes with no activity.
 */
export class ExternalSessionTracker {
  private externalSessions: Map<string, ExternalSessionInfo> = new Map();
  private eventBus: EventBus;
  private supervisor: Supervisor;
  private decayMs: number;
  private unsubscribe: (() => void) | null = null;

  constructor(options: ExternalSessionTrackerOptions) {
    this.eventBus = options.eventBus;
    this.supervisor = options.supervisor;
    this.decayMs = options.decayMs ?? 30000;

    // Subscribe to bus events, filter for file changes
    this.unsubscribe = options.eventBus.subscribe((event: BusEvent) => {
      if (event.type === "file-change") {
        this.handleFileChange(event);
      }
    });
  }

  /**
   * Check if a session is currently marked as external.
   */
  isExternal(sessionId: string): boolean {
    return this.externalSessions.has(sessionId);
  }

  /**
   * Get info about an external session, or null if not external.
   */
  getExternalSessionInfo(
    sessionId: string,
  ): { lastActivity: Date; projectId: string } | null {
    const info = this.externalSessions.get(sessionId);
    if (!info) return null;
    return { lastActivity: info.lastActivity, projectId: info.projectId };
  }

  /**
   * Get all currently external session IDs.
   */
  getExternalSessions(): string[] {
    return Array.from(this.externalSessions.keys());
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Clear all timeouts
    for (const info of this.externalSessions.values()) {
      clearTimeout(info.timeoutId);
    }
    this.externalSessions.clear();
  }

  private handleFileChange(event: FileChangeEvent): void {
    // Only care about session files
    if (event.fileType !== "session" && event.fileType !== "agent-session") {
      return;
    }

    // Parse sessionId and projectId from path
    // Format: projects/<projectId>/<sessionId>.jsonl
    const parsed = this.parseSessionPath(event.relativePath);
    if (!parsed) return;

    const { sessionId, projectId } = parsed;

    // Check if we own this session
    const process = this.supervisor.getProcessForSession(sessionId);
    if (process) {
      // We own it - remove from external tracking if present
      this.removeExternal(sessionId);
      return;
    }

    // We don't own it - mark as external
    this.markExternal(sessionId, projectId);
  }

  private parseSessionPath(
    relativePath: string,
  ): { sessionId: string; projectId: string } | null {
    // Expected format: projects/<projectId>/<sessionId>.jsonl
    // or: projects/<hostname>/<projectId>/<sessionId>.jsonl
    const parts = relativePath.split(path.sep);

    if (parts[0] !== "projects" || parts.length < 2) return null;

    // Find the .jsonl file
    const filename = parts[parts.length - 1];
    if (!filename || !filename.endsWith(".jsonl")) return null;

    // Extract sessionId (filename without .jsonl)
    const sessionId = filename.slice(0, -6); // Remove '.jsonl'

    // Skip agent sessions (they start with 'agent-')
    if (sessionId.startsWith("agent-")) return null;

    // ProjectId is everything between 'projects/' and the filename
    // For: projects/aG9tZS.../.../session.jsonl
    // ProjectId could be single part or multiple parts (hostname + encoded path)
    const projectParts = parts.slice(1, -1);
    if (projectParts.length === 0) return null;

    // Use the first part as projectId (encoded project path)
    // In the hostname case, use hostname/encodedPath format
    const projectId = projectParts.join("/");

    return { sessionId, projectId };
  }

  private markExternal(sessionId: string, projectId: string): void {
    const now = new Date();
    const existing = this.externalSessions.get(sessionId);

    if (existing) {
      // Update last activity and reset timer
      clearTimeout(existing.timeoutId);
      existing.lastActivity = now;
      existing.timeoutId = this.createDecayTimeout(sessionId);
    } else {
      // New external session
      const info: ExternalSessionInfo = {
        detectedAt: now,
        lastActivity: now,
        projectId,
        timeoutId: this.createDecayTimeout(sessionId),
      };
      this.externalSessions.set(sessionId, info);

      // Emit status change event
      this.emitStatusChange(sessionId, projectId, { state: "external" });
    }
  }

  private removeExternal(sessionId: string): void {
    const existing = this.externalSessions.get(sessionId);
    if (existing) {
      clearTimeout(existing.timeoutId);
      this.externalSessions.delete(sessionId);

      // Emit status change event
      this.emitStatusChange(sessionId, existing.projectId, { state: "idle" });
    }
  }

  private createDecayTimeout(sessionId: string): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      const info = this.externalSessions.get(sessionId);
      if (info) {
        this.externalSessions.delete(sessionId);
        // Emit status change to idle
        this.emitStatusChange(sessionId, info.projectId, { state: "idle" });
      }
    }, this.decayMs);
  }

  private emitStatusChange(
    sessionId: string,
    projectId: string,
    status: SessionStatus,
  ): void {
    const event: SessionStatusEvent = {
      type: "session-status-changed",
      sessionId,
      projectId,
      status,
      timestamp: new Date().toISOString(),
    };

    // Emit through EventBus so it gets broadcast via SSE
    this.eventBus.emit(event);
  }
}
