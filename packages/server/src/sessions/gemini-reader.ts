/**
 * GeminiSessionReader - Reads Gemini sessions from disk.
 *
 * Gemini stores sessions at ~/.gemini/tmp/<projectHash>/chats/session-*.json
 * with a different format than Claude or Codex:
 * - JSON files (not JSONL)
 * - sessionId, projectHash, startTime, lastUpdated
 * - messages[] array with user and gemini message types
 *
 * Unlike Claude's DAG structure, Gemini sessions are linear.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  type GeminiAssistantMessage,
  type GeminiSessionFile,
  type GeminiSessionMessage,
  type GeminiUserMessage,
  SESSION_TITLE_MAX_LENGTH,
  type UrlProjectId,
  type UnifiedSession,
  parseGeminiSessionFile,
} from "@yep-anywhere/shared";
import type {
  ContentBlock,
  ContextUsage,
  Message,
  Session,
  SessionSummary,
} from "../supervisor/types.js";
import type {
  GetSessionOptions,
  ISessionReader,
  LoadedSession,
} from "./types.js";

// Gemini model context window size (1M tokens for Gemini 2.0)
const CONTEXT_WINDOW_SIZE = 1_000_000;

export interface GeminiSessionReaderOptions {
  /**
   * Base directory for Gemini sessions (~/.gemini/tmp).
   * Sessions are stored in <projectHash>/chats/session-*.json structure.
   */
  sessionsDir: string;
  /**
   * The project path (cwd) to filter sessions by.
   * Only sessions with this cwd will be listed.
   */
  projectPath?: string;
  /**
   * Optional map of projectHash -> cwd for filtering.
   * If not provided, all sessions will be listed.
   * Can be a Map or a Promise that resolves to a Map.
   */
  hashToCwd?: Map<string, string> | Promise<Map<string, string>>;
}

interface GeminiSessionCacheEntry {
  id: string;
  filePath: string;
  projectHash: string;
  startTime: string;
  mtime: number;
  size: number;
}

/**
 * Gemini-specific session reader for Gemini CLI JSON files.
 *
 * Handles Gemini's linear conversation structure with user and gemini messages.
 */
export class GeminiSessionReader implements ISessionReader {
  private sessionsDir: string;
  private projectPath?: string;
  private hashToCwd?: Map<string, string> | Promise<Map<string, string>>;

  // Cache of session ID -> file info for quick lookups
  private sessionFileCache: Map<string, GeminiSessionCacheEntry> = new Map();
  private cacheTimestamp = 0;
  private readonly CACHE_TTL_MS = 5000; // 5 second cache

  constructor(options: GeminiSessionReaderOptions) {
    this.sessionsDir = options.sessionsDir;
    this.projectPath = options.projectPath;
    this.hashToCwd = options.hashToCwd;
  }

  async listSessions(projectId: UrlProjectId): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];
    const sessions = await this.scanSessions();

    for (const session of sessions) {
      // Filter by project path if set
      if (this.projectPath) {
        // Resolve hashToCwd if needed
        let map: Map<string, string> | undefined;
        if (this.hashToCwd instanceof Promise) {
          map = await this.hashToCwd;
        } else {
          map = this.hashToCwd;
        }

        const cwd = map?.get(session.projectHash);
        if (cwd !== this.projectPath) {
          continue;
        }
      }

      const summary = await this.getSessionSummary(session.id, projectId);
      if (summary) {
        summaries.push(summary);
      }
    }

    // Sort by updatedAt descending
    summaries.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    return summaries;
  }

  async getSessionSummary(
    sessionId: string,
    projectId: UrlProjectId,
  ): Promise<SessionSummary | null> {
    const sessionCache = await this.findSessionFile(sessionId);
    if (!sessionCache) return null;

    try {
      const content = await readFile(sessionCache.filePath, "utf-8");
      const session = parseGeminiSessionFile(content);

      if (!session || session.messages.length === 0) return null;

      const stats = await stat(sessionCache.filePath);
      const { title, fullTitle } = this.extractTitle(session.messages);
      const messageCount = session.messages.length;
      const contextUsage = this.extractContextUsage(session.messages);
      const model = this.extractModel(session.messages);

      // Skip sessions with no actual conversation messages
      if (messageCount === 0) return null;

      return {
        id: sessionId,
        projectId,
        title,
        fullTitle,
        createdAt: session.startTime,
        updatedAt: session.lastUpdated ?? stats.mtime.toISOString(),
        messageCount,
        status: { state: "idle" },
        contextUsage,
        provider: "gemini",
        model,
      };
    } catch {
      return null;
    }
  }

  async getSession(
    sessionId: string,
    projectId: UrlProjectId,
    afterMessageId?: string,
    _options?: GetSessionOptions,
  ): Promise<LoadedSession | null> {
    const summary = await this.getSessionSummary(sessionId, projectId);
    if (!summary) return null;

    const sessionCache = await this.findSessionFile(sessionId);
    if (!sessionCache) return null;

    const content = await readFile(sessionCache.filePath, "utf-8");
    const sessionFile = parseGeminiSessionFile(content);
    if (!sessionFile) return null;

    // Filter messages for incremental fetching if needed
    // For Gemini, messages have 'id' which we map to 'uuid'
    // This is a bit tricky with raw session return, similar to Claude reader note.
    // For now, we return the full session or slice the messages array if we can.
    let messages = sessionFile.messages;
    if (afterMessageId) {
      const afterIndex = messages.findIndex((m) => m.id === afterMessageId);
      if (afterIndex !== -1) {
        messages = messages.slice(afterIndex + 1);
      }
    }

    return {
      summary,
      data: {
        provider: "gemini",
        session: {
          ...sessionFile,
          messages,
        },
      },
    };
  }

  async getSessionSummaryIfChanged(
    sessionId: string,
    projectId: UrlProjectId,
    cachedMtime: number,
    cachedSize: number,
  ): Promise<{ summary: SessionSummary; mtime: number; size: number } | null> {
    const sessionCache = await this.findSessionFile(sessionId);
    if (!sessionCache) return null;

    try {
      const stats = await stat(sessionCache.filePath);
      const mtime = stats.mtimeMs;
      const size = stats.size;

      // If mtime and size match cached values, return null (no change)
      if (mtime === cachedMtime && size === cachedSize) {
        return null;
      }

      const summary = await this.getSessionSummary(sessionId, projectId);
      if (!summary) return null;

      return { summary, mtime, size };
    } catch {
      return null;
    }
  }

  /**
   * Gemini doesn't have subagent sessions like Claude.
   * Returns empty array for compatibility.
   */
  async getAgentMappings(): Promise<{ toolUseId: string; agentId: string }[]> {
    return [];
  }

  /**
   * Gemini doesn't have subagent sessions like Claude.
   * Returns null for compatibility.
   */
  async getAgentSession(
    _agentId: string,
  ): Promise<{ messages: Message[]; status: string } | null> {
    return null;
  }

  /**
   * Scan the sessions directory and find all session files.
   */
  private async scanSessions(): Promise<GeminiSessionCacheEntry[]> {
    // Check cache
    if (Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return Array.from(this.sessionFileCache.values());
    }

    const sessions: GeminiSessionCacheEntry[] = [];

    try {
      await stat(this.sessionsDir);
    } catch {
      // Directory doesn't exist
      return [];
    }

    // Scan ~/.gemini/tmp/{projectHash}/chats/*.json
    const projectHashDirs = await this.findProjectHashDirs();

    for (const { hashDir, projectHash } of projectHashDirs) {
      const chatsDir = join(hashDir, "chats");
      try {
        await stat(chatsDir);
        const files = await this.findSessionFiles(chatsDir);

        for (const filePath of files) {
          const session = await this.readSessionMeta(filePath, projectHash);
          if (session) {
            sessions.push(session);
            this.sessionFileCache.set(session.id, session);
          }
        }
      } catch {
        // Chats directory doesn't exist, skip
      }
    }

    this.cacheTimestamp = Date.now();
    return sessions;
  }

  /**
   * Find all project hash directories in ~/.gemini/tmp/
   */
  private async findProjectHashDirs(): Promise<
    { hashDir: string; projectHash: string }[]
  > {
    const dirs: { hashDir: string; projectHash: string }[] = [];

    try {
      const entries = await readdir(this.sessionsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirs.push({
            hashDir: join(this.sessionsDir, entry.name),
            projectHash: entry.name,
          });
        }
      }
    } catch {
      // Ignore errors
    }

    return dirs;
  }

  /**
   * Find all session JSON files in a chats directory.
   */
  private async findSessionFiles(chatsDir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(chatsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (
          entry.isFile() &&
          entry.name.startsWith("session-") &&
          entry.name.endsWith(".json")
        ) {
          files.push(join(chatsDir, entry.name));
        }
      }
    } catch {
      // Ignore errors
    }

    return files;
  }

  /**
   * Find a session file by ID.
   */
  private async findSessionFile(
    sessionId: string,
  ): Promise<GeminiSessionCacheEntry | null> {
    // Check cache first
    const cached = this.sessionFileCache.get(sessionId);
    if (cached) return cached;

    // Scan if cache miss
    await this.scanSessions();
    return this.sessionFileCache.get(sessionId) ?? null;
  }

  /**
   * Read session metadata from a file.
   */
  private async readSessionMeta(
    filePath: string,
    projectHash: string,
  ): Promise<GeminiSessionCacheEntry | null> {
    try {
      const stats = await stat(filePath);
      const content = await readFile(filePath, "utf-8");
      const session = parseGeminiSessionFile(content);

      if (!session) return null;

      return {
        id: session.sessionId,
        filePath,
        projectHash,
        startTime: session.startTime,
        mtime: stats.mtimeMs,
        size: stats.size,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract title from messages (first user message).
   */
  private extractTitle(messages: GeminiSessionMessage[]): {
    title: string | null;
    fullTitle: string | null;
  } {
    // Find first user message
    for (const msg of messages) {
      if (msg.type === "user") {
        const userMsg = msg as GeminiUserMessage;
        const fullTitle = userMsg.content.trim();
        const title =
          fullTitle.length <= SESSION_TITLE_MAX_LENGTH
            ? fullTitle
            : `${fullTitle.slice(0, SESSION_TITLE_MAX_LENGTH - 3)}...`;
        return { title, fullTitle };
      }
    }

    return { title: null, fullTitle: null };
  }

  /**
   * Extract context usage from token counts in messages.
   */
  private extractContextUsage(
    messages: GeminiSessionMessage[],
  ): ContextUsage | undefined {
    // Find last assistant message with token info
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg && msg.type === "gemini") {
        const assistantMsg = msg as GeminiAssistantMessage;
        if (assistantMsg.tokens?.input) {
          const inputTokens =
            assistantMsg.tokens.input + (assistantMsg.tokens.cached ?? 0);
          const contextWindow = CONTEXT_WINDOW_SIZE;
          const percentage = Math.round((inputTokens / contextWindow) * 100);

          return { inputTokens, percentage };
        }
      }
    }

    return undefined;
  }

  /**
   * Extract the model from the first assistant message.
   */
  private extractModel(messages: GeminiSessionMessage[]): string | undefined {
    // Find the first assistant message with a model field
    for (const msg of messages) {
      if (msg.type === "gemini") {
        const assistantMsg = msg as GeminiAssistantMessage;
        if (assistantMsg.model) {
          return assistantMsg.model;
        }
      }
    }
    return undefined;
  }
}
