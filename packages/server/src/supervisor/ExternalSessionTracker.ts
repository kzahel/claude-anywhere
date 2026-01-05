import * as path from "node:path";
import {
  type DirProjectId,
  type UrlProjectId,
  asDirProjectId,
} from "@yep-anywhere/shared";
import type { ProjectScanner } from "../projects/scanner.js";
import { BatchProcessor } from "../watcher/BatchProcessor.js";
import type {
  BusEvent,
  EventBus,
  FileChangeEvent,
  SessionAbortedEvent,
  SessionCreatedEvent,
  SessionStatusEvent,
} from "../watcher/EventBus.js";
import type { Supervisor } from "./Supervisor.js";
import type { SessionStatus, SessionSummary } from "./types.js";

interface ExternalSessionInfo {
  detectedAt: Date;
  lastActivity: Date;
  /** Directory-format projectId (from file path, NOT base64url) */
  dirProjectId: DirProjectId;
  timeoutId: ReturnType<typeof setTimeout>;
}

/** Default grace period after abort before external detection resumes (30 seconds) */
const DEFAULT_ABORT_GRACE_MS = 30000;

export interface ExternalSessionTrackerOptions {
  eventBus: EventBus;
  supervisor: Supervisor;
  scanner: ProjectScanner;
  /** Time in ms before external status decays to idle (default: 30000) */
  decayMs?: number;
  /** Grace period in ms after abort before external detection resumes (default: 30000) */
  abortGraceMs?: number;
  /** Optional callback to get session summary for new external sessions */
  getSessionSummary?: (
    sessionId: string,
    projectId: UrlProjectId,
  ) => Promise<SessionSummary | null>;
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
  /** Sessions recently aborted by this server - grace period before external detection */
  private recentlyAborted: Map<string, number> = new Map(); // sessionId -> timestamp
  private eventBus: EventBus;
  private supervisor: Supervisor;
  private scanner: ProjectScanner;
  private decayMs: number;
  private abortGraceMs: number;
  private unsubscribe: (() => void) | null = null;
  private getSessionSummary?: (
    sessionId: string,
    projectId: UrlProjectId,
  ) => Promise<SessionSummary | null>;
  /** Batches session parsing to prevent OOM from concurrent file reads */
  private sessionParser: BatchProcessor<SessionSummary | null>;

  constructor(options: ExternalSessionTrackerOptions) {
    this.eventBus = options.eventBus;
    this.supervisor = options.supervisor;
    this.scanner = options.scanner;
    this.decayMs = options.decayMs ?? 30000;
    this.abortGraceMs = options.abortGraceMs ?? DEFAULT_ABORT_GRACE_MS;
    this.getSessionSummary = options.getSessionSummary;

    // Initialize batch processor for session parsing
    // Limits concurrent JSONL parsing to prevent OOM during bulk file operations
    this.sessionParser = new BatchProcessor<SessionSummary | null>({
      concurrency: 5,
      batchMs: 300,
      onResult: (sessionId, summary) => {
        if (summary) {
          // Update status to external
          summary.status = { state: "external" };

          const event: SessionCreatedEvent = {
            type: "session-created",
            session: summary,
            timestamp: new Date().toISOString(),
          };
          this.eventBus.emit(event);
        }
      },
      onError: (sessionId, error) => {
        // Log but don't fail - session may not be readable yet
        console.warn(
          `[ExternalSessionTracker] Failed to read session ${sessionId}:`,
          error.message,
        );
      },
    });

    // Subscribe to bus events
    this.unsubscribe = options.eventBus.subscribe((event: BusEvent) => {
      if (event.type === "file-change") {
        this.handleFileChange(event);
      } else if (event.type === "session-aborted") {
        this.handleSessionAborted(event);
      }
    });
  }

  private handleSessionAborted(event: SessionAbortedEvent): void {
    this.markAborted(event.sessionId);
  }

  /**
   * Check if a session is currently marked as external.
   */
  isExternal(sessionId: string): boolean {
    return this.externalSessions.has(sessionId);
  }

  /**
   * Get info about an external session, or null if not external.
   * Returns the directory-format projectId (for internal use only).
   */
  getExternalSessionInfo(
    sessionId: string,
  ): { lastActivity: Date; dirProjectId: DirProjectId } | null {
    const info = this.externalSessions.get(sessionId);
    if (!info) return null;
    return { lastActivity: info.lastActivity, dirProjectId: info.dirProjectId };
  }

  /**
   * Get info about an external session with URL-format projectId.
   * Use this for API responses and events.
   */
  async getExternalSessionInfoWithUrlId(
    sessionId: string,
  ): Promise<{ lastActivity: Date; projectId: UrlProjectId } | null> {
    const info = this.externalSessions.get(sessionId);
    if (!info) return null;

    const project = await this.scanner.getProjectBySessionDirSuffix(
      info.dirProjectId,
    );
    if (!project) return null;

    return {
      lastActivity: info.lastActivity,
      projectId: project.id as UrlProjectId,
    };
  }

  /**
   * Mark a session as recently aborted. During the grace period, file changes
   * won't trigger external session detection (they're from our own cleanup).
   * Called by Supervisor when a process is aborted.
   */
  markAborted(sessionId: string): void {
    this.recentlyAborted.set(sessionId, Date.now());
    // Also remove from external tracking if present (abort takes precedence)
    this.removeExternal(sessionId);
  }

  /**
   * Check if a session is within the abort grace period.
   */
  private isInAbortGracePeriod(sessionId: string): boolean {
    const abortedAt = this.recentlyAborted.get(sessionId);
    if (!abortedAt) return false;

    const elapsed = Date.now() - abortedAt;
    if (elapsed >= this.abortGraceMs) {
      // Grace period expired - clean up
      this.recentlyAborted.delete(sessionId);
      return false;
    }
    return true;
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

    // Clear batch processor
    this.sessionParser.dispose();

    // Clear all timeouts
    for (const info of this.externalSessions.values()) {
      clearTimeout(info.timeoutId);
    }
    this.externalSessions.clear();
    this.recentlyAborted.clear();
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

    const { sessionId, dirProjectId } = parsed;

    // Check if we own this session
    const process = this.supervisor.getProcessForSession(sessionId);
    if (process) {
      // We own it - remove from external tracking if present
      this.removeExternal(sessionId);
      return;
    }

    // Check if this session was recently aborted by us - ignore file changes
    // during grace period (they're from our own process cleanup, not external)
    if (this.isInAbortGracePeriod(sessionId)) {
      return;
    }

    // We don't own it and it's not in grace period - mark as external
    this.markExternal(sessionId, dirProjectId);
  }

  private parseSessionPath(
    relativePath: string,
  ): { sessionId: string; dirProjectId: DirProjectId } | null {
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
    const dirProjectId = asDirProjectId(projectParts.join("/"));

    return { sessionId, dirProjectId };
  }

  private markExternal(sessionId: string, dirProjectId: DirProjectId): void {
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
        dirProjectId,
        timeoutId: this.createDecayTimeout(sessionId),
      };
      this.externalSessions.set(sessionId, info);

      // Queue session parsing - batched to prevent OOM from bulk file operations
      if (this.getSessionSummary) {
        const getSessionSummary = this.getSessionSummary;
        this.sessionParser.enqueue(sessionId, async () => {
          const project =
            await this.scanner.getProjectBySessionDirSuffix(dirProjectId);
          if (!project) {
            console.warn(
              `[ExternalSessionTracker] Cannot emit session-created - project not found: ${dirProjectId}`,
            );
            return null;
          }
          return getSessionSummary(sessionId, project.id as UrlProjectId);
        });
      }

      // Emit status change event
      this.emitStatusChange(sessionId, dirProjectId, { state: "external" });
    }
  }

  private removeExternal(sessionId: string): void {
    const existing = this.externalSessions.get(sessionId);
    if (existing) {
      clearTimeout(existing.timeoutId);
      this.externalSessions.delete(sessionId);

      // Emit status change event
      this.emitStatusChange(sessionId, existing.dirProjectId, {
        state: "idle",
      });
    }
  }

  private createDecayTimeout(sessionId: string): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      const info = this.externalSessions.get(sessionId);
      if (info) {
        this.externalSessions.delete(sessionId);
        // Emit status change to idle
        this.emitStatusChange(sessionId, info.dirProjectId, { state: "idle" });
      }
    }, this.decayMs);
  }

  private async emitStatusChange(
    sessionId: string,
    dirProjectId: DirProjectId,
    status: SessionStatus,
  ): Promise<void> {
    // Convert directory format to URL format for events
    const project =
      await this.scanner.getProjectBySessionDirSuffix(dirProjectId);
    if (!project) {
      console.warn(
        `[ExternalSessionTracker] Cannot emit status change - project not found: ${dirProjectId}`,
      );
      return;
    }

    const event: SessionStatusEvent = {
      type: "session-status-changed",
      sessionId,
      projectId: project.id,
      status,
      timestamp: new Date().toISOString(),
    };

    // Emit through EventBus so it gets broadcast via SSE
    this.eventBus.emit(event);
  }
}
