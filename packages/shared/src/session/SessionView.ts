/**
 * SessionView provides a unified interface for session display in the UI.
 *
 * This class encapsulates all the data needed to render session UI components:
 * - Title handling (auto, custom, display priority)
 * - Metadata (starred, archived)
 * - Notification state (unread, pending input)
 * - Process state (running, idle, waiting)
 * - Context usage
 *
 * Used by:
 * - Client: Instantiate from API responses for consistent UI rendering
 * - Server: Extended by Session class which adds I/O capabilities
 */

import type {
  AppSessionSummary,
  AppSessionStatus,
  PendingInputType,
  ProcessStateType,
  ContextUsage,
} from "../app-types.js";
import type { UrlProjectId } from "../projectId.js";

/** Maximum length for truncated titles */
export const SESSION_TITLE_MAX_LENGTH = 120;

export class SessionView {
  constructor(
    /** Session identifier */
    readonly id: string,
    /** Project this session belongs to */
    readonly projectId: UrlProjectId,
    /** Auto-generated title from first user message (truncated to 120 chars) */
    readonly autoTitle: string | null,
    /** Full first user message (for hover tooltips) */
    readonly fullTitle: string | null,
    /** User's custom title (overrides autoTitle for display) */
    readonly customTitle: string | undefined,
    /** When session was created */
    readonly createdAt: string,
    /** When session was last updated */
    readonly updatedAt: string,
    /** Number of messages in the session */
    readonly messageCount: number,
    /** Session ownership/process status */
    readonly status: AppSessionStatus,
    /** Whether session is archived (hidden from default list) */
    readonly isArchived: boolean,
    /** Whether session is starred/favorited */
    readonly isStarred: boolean,
    /** Type of pending input if session needs user action */
    readonly pendingInputType: PendingInputType | undefined,
    /** Current process state (running, idle, waiting-input, terminated) */
    readonly processState: ProcessStateType | undefined,
    /** When the session was last viewed */
    readonly lastSeenAt: string | undefined,
    /** Whether session has new content since last viewed */
    readonly hasUnread: boolean,
    /** Context window usage information */
    readonly contextUsage: ContextUsage | undefined,
  ) {}

  // ===========================================================================
  // Title Getters
  // ===========================================================================

  /**
   * Get the title to display in the UI.
   * Priority: customTitle > autoTitle > "Untitled"
   */
  get displayTitle(): string {
    return this.customTitle ?? this.autoTitle ?? "Untitled";
  }

  /**
   * Check if the session has a user-defined custom title.
   */
  get hasCustomTitle(): boolean {
    return !!this.customTitle;
  }

  /**
   * Get the title for tooltips (full content, not truncated).
   * Falls back to autoTitle if fullTitle not available.
   */
  get tooltipTitle(): string | null {
    return this.fullTitle ?? this.autoTitle;
  }

  /**
   * Check if the auto-generated title was truncated.
   */
  get isTruncated(): boolean {
    if (!this.autoTitle || !this.fullTitle) return false;
    return this.autoTitle !== this.fullTitle;
  }

  // ===========================================================================
  // Status Getters
  // ===========================================================================

  /**
   * Check if the session is currently active (owned by this server).
   */
  get isActive(): boolean {
    return this.status.state === "owned";
  }

  /**
   * Check if the session is controlled by an external process.
   */
  get isExternal(): boolean {
    return this.status.state === "external";
  }

  /**
   * Check if the session is idle (no active process).
   */
  get isIdle(): boolean {
    return this.status.state === "idle";
  }

  /**
   * Check if the session is waiting for user input.
   */
  get isWaitingForInput(): boolean {
    return this.processState === "waiting-input";
  }

  /**
   * Check if the session process is currently running.
   */
  get isRunning(): boolean {
    return this.processState === "running";
  }

  /**
   * Check if the session needs attention (pending input or unread).
   */
  get needsAttention(): boolean {
    return this.hasUnread || !!this.pendingInputType;
  }

  // ===========================================================================
  // Factory Methods
  // ===========================================================================

  /**
   * Create a SessionView from an API session summary response.
   */
  static from(summary: AppSessionSummary): SessionView {
    return new SessionView(
      summary.id,
      summary.projectId,
      summary.title,
      summary.fullTitle,
      summary.customTitle,
      summary.createdAt,
      summary.updatedAt,
      summary.messageCount,
      summary.status,
      summary.isArchived ?? false,
      summary.isStarred ?? false,
      summary.pendingInputType,
      summary.processState,
      summary.lastSeenAt,
      summary.hasUnread ?? false,
      summary.contextUsage,
    );
  }

  /**
   * Create a SessionView from partial data.
   * Useful for creating views from cached or incomplete data.
   */
  static fromPartial(data: {
    id: string;
    projectId?: UrlProjectId;
    title?: string | null;
    fullTitle?: string | null;
    customTitle?: string;
    createdAt?: string;
    updatedAt?: string;
    messageCount?: number;
    status?: AppSessionStatus;
    isArchived?: boolean;
    isStarred?: boolean;
    pendingInputType?: PendingInputType;
    processState?: ProcessStateType;
    lastSeenAt?: string;
    hasUnread?: boolean;
    contextUsage?: ContextUsage;
  }): SessionView {
    const now = new Date().toISOString();
    return new SessionView(
      data.id,
      data.projectId ?? ("" as UrlProjectId),
      data.title ?? null,
      data.fullTitle ?? null,
      data.customTitle,
      data.createdAt ?? now,
      data.updatedAt ?? now,
      data.messageCount ?? 0,
      data.status ?? { state: "idle" },
      data.isArchived ?? false,
      data.isStarred ?? false,
      data.pendingInputType,
      data.processState,
      data.lastSeenAt,
      data.hasUnread ?? false,
      data.contextUsage,
    );
  }
}

/**
 * Standalone utility function for getting display title from session-like objects.
 * Useful when you don't need a full SessionView instance.
 *
 * @param session - Object with optional title fields
 * @returns The display title (customTitle > title > "Untitled")
 */
export function getSessionDisplayTitle(
  session: { customTitle?: string; title?: string | null } | null | undefined,
): string {
  if (!session) return "Untitled";
  return session.customTitle ?? session.title ?? "Untitled";
}
