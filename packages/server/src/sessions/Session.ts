/**
 * Session class provides a unified interface for session operations on the server.
 *
 * Extends SessionView (from shared) with server-side I/O capabilities:
 * - Reading/writing custom titles
 * - Refreshing from disk
 * - Archive/star status management
 *
 * Usage:
 *   const session = await Session.load(sessionId, projectId, deps);
 *   console.log(session.displayTitle);  // inherited from SessionView
 *   await session.rename("New name");   // server-only
 */

import {
  SessionView,
  type UrlProjectId,
  type AppSessionSummary,
} from "@claude-anywhere/shared";
import type { SessionIndexService } from "../indexes/SessionIndexService.js";
import type { SessionMetadataService } from "../metadata/SessionMetadataService.js";
import type { SessionReader } from "./reader.js";

/**
 * Dependencies required by Session for I/O operations.
 * Passed via constructor or load() for testability.
 */
export interface SessionDeps {
  indexService: SessionIndexService;
  metadataService: SessionMetadataService;
  reader: SessionReader;
  sessionDir: string;
}

/**
 * Session extends SessionView with server-side capabilities.
 */
export class Session extends SessionView {
  /** Project this session belongs to */
  readonly projectId: UrlProjectId;

  /** Whether session is archived */
  readonly isArchived: boolean;

  /** Whether session is starred */
  readonly isStarred: boolean;

  private deps: SessionDeps;

  constructor(
    id: string,
    projectId: UrlProjectId,
    deps: SessionDeps,
    autoTitle: string | null,
    fullTitle: string | null,
    customTitle?: string,
    isArchived?: boolean,
    isStarred?: boolean,
  ) {
    super(id, autoTitle, fullTitle, customTitle);
    this.projectId = projectId;
    this.deps = deps;
    this.isArchived = isArchived ?? false;
    this.isStarred = isStarred ?? false;
  }

  /**
   * Load a session by ID, combining data from cache and metadata services.
   *
   * @param sessionId - The session ID
   * @param projectId - The project ID
   * @param deps - Service dependencies for I/O
   * @returns Session instance or null if not found
   */
  static async load(
    sessionId: string,
    projectId: UrlProjectId,
    deps: SessionDeps,
  ): Promise<Session | null> {
    // Get full summary to check if session exists
    const summary = await deps.reader.getSessionSummary(sessionId, projectId);

    // Return null if session doesn't exist
    if (!summary) {
      return null;
    }

    // Get auto-generated title from cache/reader (may be cached)
    const autoTitle = await deps.indexService.getSessionTitle(
      deps.sessionDir,
      projectId,
      sessionId,
      deps.reader,
    );

    // Get custom metadata
    const metadata = deps.metadataService.getMetadata(sessionId);

    return new Session(
      sessionId,
      projectId,
      deps,
      autoTitle,
      summary.fullTitle,
      metadata?.customTitle,
      metadata?.isArchived,
      metadata?.isStarred,
    );
  }

  /**
   * Create a Session from an existing AppSessionSummary (already loaded data).
   * Useful when you've already fetched the summary via other means.
   */
  static fromSummary(
    summary: AppSessionSummary,
    deps: SessionDeps,
  ): Session {
    return new Session(
      summary.id,
      summary.projectId,
      deps,
      summary.title,
      summary.fullTitle,
      summary.customTitle,
      summary.isArchived,
      summary.isStarred,
    );
  }

  /**
   * Set a custom title for this session.
   * Pass undefined or empty string to clear the custom title.
   */
  async rename(title: string | undefined): Promise<void> {
    await this.deps.metadataService.setTitle(this.id, title);
  }

  /**
   * Set the archived status for this session.
   */
  async setArchived(archived: boolean): Promise<void> {
    await this.deps.metadataService.setArchived(this.id, archived);
  }

  /**
   * Set the starred status for this session.
   */
  async setStarred(starred: boolean): Promise<void> {
    await this.deps.metadataService.setStarred(this.id, starred);
  }

  /**
   * Refresh session data from disk.
   * Returns a new Session instance with updated data.
   */
  async refresh(): Promise<Session | null> {
    // Invalidate cache to force re-read
    this.deps.indexService.invalidateSession(this.deps.sessionDir, this.id);

    // Reload
    return Session.load(this.id, this.projectId, this.deps);
  }

  /**
   * Get the auto-generated title (from first user message).
   * This is the title before any custom rename.
   */
  getAutoTitle(): string | null {
    return this.autoTitle;
  }

  /**
   * Convert to a plain object suitable for API responses.
   * Includes all SessionView properties plus metadata.
   */
  toJSON(): {
    id: string;
    projectId: UrlProjectId;
    autoTitle: string | null;
    fullTitle: string | null;
    customTitle: string | undefined;
    displayTitle: string;
    isArchived: boolean;
    isStarred: boolean;
  } {
    return {
      id: this.id,
      projectId: this.projectId,
      autoTitle: this.autoTitle,
      fullTitle: this.fullTitle,
      customTitle: this.customTitle,
      displayTitle: this.displayTitle,
      isArchived: this.isArchived,
      isStarred: this.isStarred,
    };
  }
}
