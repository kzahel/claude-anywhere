/**
 * SessionView provides a unified interface for session title handling.
 *
 * This class encapsulates the logic for working with session titles:
 * - autoTitle: Extracted from the first user message (cached)
 * - fullTitle: Complete first user message (for tooltips)
 * - customTitle: User's renamed title (overrides autoTitle for display)
 *
 * Used by:
 * - Client: Instantiate from API responses for display logic
 * - Server: Extended by Session class which adds I/O capabilities
 */

import type { AppSessionSummary } from "../app-types.js";

/** Maximum length for truncated titles */
export const SESSION_TITLE_MAX_LENGTH = 120;

export class SessionView {
  constructor(
    /** Session identifier */
    readonly id: string,
    /** Auto-generated title from first user message (truncated to 120 chars) */
    readonly autoTitle: string | null,
    /** Full first user message (for hover tooltips) */
    readonly fullTitle: string | null,
    /** User's custom title (overrides autoTitle for display) */
    readonly customTitle?: string,
  ) {}

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

  /**
   * Create a SessionView from an API session summary response.
   */
  static from(summary: AppSessionSummary): SessionView {
    return new SessionView(
      summary.id,
      summary.title,
      summary.fullTitle,
      summary.customTitle,
    );
  }

  /**
   * Create a SessionView from partial data.
   * Useful for creating views from cached or incomplete data.
   */
  static fromPartial(data: {
    id: string;
    title?: string | null;
    fullTitle?: string | null;
    customTitle?: string;
  }): SessionView {
    return new SessionView(
      data.id,
      data.title ?? null,
      data.fullTitle ?? null,
      data.customTitle,
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
