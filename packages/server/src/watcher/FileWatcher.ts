import * as fs from "node:fs";
import * as path from "node:path";
import type {
  EventBus,
  FileChangeEvent,
  FileChangeType,
  WatchProvider,
} from "./EventBus.js";

export interface FileWatcherOptions {
  /** Directory to watch (e.g., ~/.claude) */
  watchDir: string;
  /** Provider that owns this directory */
  provider: WatchProvider;
  /** EventBus to emit events to */
  eventBus: EventBus;
  /** Debounce delay in ms (default: 200) */
  debounceMs?: number;
}

export class FileWatcher {
  private watchDir: string;
  private provider: WatchProvider;
  private eventBus: EventBus;
  private debounceMs: number;
  private watcher: fs.FSWatcher | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private knownFiles: Set<string> = new Set();

  constructor(options: FileWatcherOptions) {
    this.watchDir = options.watchDir;
    this.provider = options.provider;
    this.eventBus = options.eventBus;
    this.debounceMs = options.debounceMs ?? 200;
  }

  /**
   * Start watching for file changes.
   */
  start(): void {
    if (this.watcher) {
      return; // Already watching
    }

    // Build initial file list for detecting create vs modify
    this.scanExistingFiles();

    try {
      this.watcher = fs.watch(
        this.watchDir,
        { recursive: true },
        (eventType, filename) => {
          if (filename) {
            this.handleFileEvent(eventType, filename);
          }
        },
      );

      this.watcher.on("error", (error) => {
        console.error("[FileWatcher] Error:", error);
      });

      console.log(`[FileWatcher] Watching ${this.watchDir}`);
    } catch (error) {
      console.error("[FileWatcher] Failed to start:", error);
    }
  }

  /**
   * Stop watching for file changes.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.knownFiles.clear();

    console.log("[FileWatcher] Stopped");
  }

  /**
   * Check if watcher is active.
   */
  get isWatching(): boolean {
    return this.watcher !== null;
  }

  private scanExistingFiles(): void {
    this.knownFiles.clear();
    this.scanDir(this.watchDir);
  }

  private scanDir(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.scanDir(fullPath);
        } else {
          this.knownFiles.add(fullPath);
        }
      }
    } catch {
      // Ignore errors (e.g., permission denied)
    }
  }

  private handleFileEvent(eventType: string, filename: string): void {
    const fullPath = path.join(this.watchDir, filename);

    // Debounce per-file
    const existingTimer = this.debounceTimers.get(fullPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(fullPath);
      this.emitEvent(fullPath, eventType);
    }, this.debounceMs);

    this.debounceTimers.set(fullPath, timer);
  }

  private emitEvent(fullPath: string, _eventType: string): void {
    // Determine change type
    let changeType: FileChangeType;
    const fileExists = fs.existsSync(fullPath);

    if (!fileExists) {
      if (this.knownFiles.has(fullPath)) {
        changeType = "delete";
        this.knownFiles.delete(fullPath);
      } else {
        // File never existed from our POV, skip
        return;
      }
    } else if (this.knownFiles.has(fullPath)) {
      changeType = "modify";
    } else {
      changeType = "create";
      this.knownFiles.add(fullPath);
    }

    const relativePath = path.relative(this.watchDir, fullPath);

    const event: FileChangeEvent = {
      type: "file-change",
      provider: this.provider,
      path: fullPath,
      relativePath,
      changeType,
      timestamp: new Date().toISOString(),
      fileType: this.parseFileType(relativePath),
    };

    this.eventBus.emit(event);
  }

  private parseFileType(relativePath: string): FileChangeEvent["fileType"] {
    switch (this.provider) {
      case "claude":
        return this.parseClaudeFileType(relativePath);
      case "gemini":
        return this.parseGeminiFileType(relativePath);
      case "codex":
        return this.parseCodexFileType(relativePath);
    }
  }

  private parseClaudeFileType(
    relativePath: string,
  ): FileChangeEvent["fileType"] {
    // Watching ~/.claude/projects - relativePath is {hash}/{session}.jsonl
    if (relativePath.endsWith(".jsonl")) {
      if (path.basename(relativePath).startsWith("agent-")) {
        return "agent-session";
      }
      return "session";
    }
    return "other";
  }

  private parseGeminiFileType(
    relativePath: string,
  ): FileChangeEvent["fileType"] {
    // Watching ~/.gemini/tmp - relativePath is {hash}/chats/session-*.json
    if (relativePath.includes("/chats/") && relativePath.endsWith(".json")) {
      return "session";
    }
    return "other";
  }

  private parseCodexFileType(
    relativePath: string,
  ): FileChangeEvent["fileType"] {
    // Watching ~/.codex/sessions - relativePath is {year}/{month}/{day}/rollout-*.jsonl
    if (relativePath.endsWith(".jsonl")) {
      return "session";
    }
    return "other";
  }
}
