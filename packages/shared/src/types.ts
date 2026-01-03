/**
 * Provider name - which AI agent provider to use.
 * - "claude": Claude via Anthropic SDK
 * - "codex": OpenAI Codex via CLI (supports local models via --oss)
 * - "gemini": Google Gemini via CLI
 */
export type ProviderName = "claude" | "codex" | "gemini";

/**
 * Provider info for UI display.
 */
export interface ProviderInfo {
  name: ProviderName;
  displayName: string;
  installed: boolean;
  authenticated: boolean;
  enabled: boolean;
  expiresAt?: string;
  user?: { email?: string; name?: string };
}

/**
 * Permission mode for tool approvals.
 * - "default": Auto-approve read-only tools (Read, Glob, Grep, etc.), ask for mutating tools
 * - "acceptEdits": Auto-approve file editing tools (Edit, Write, NotebookEdit), ask for others
 * - "plan": Auto-approve read-only tools, ask for others (planning/analysis mode)
 * - "bypassPermissions": Auto-approve all tools (full autonomous mode)
 */
export type PermissionMode =
  | "default"
  | "bypassPermissions"
  | "acceptEdits"
  | "plan";

/**
 * Model option for Claude sessions.
 * - "default": Use the CLI's default model
 * - "sonnet": Claude Sonnet
 * - "opus": Claude Opus
 * - "haiku": Claude Haiku
 */
export type ModelOption = "default" | "sonnet" | "opus" | "haiku";

/**
 * Extended thinking budget option.
 * - "off": No extended thinking
 * - "light": 4K tokens
 * - "medium": 16K tokens
 * - "thorough": 32K tokens
 */
export type ThinkingOption = "off" | "light" | "medium" | "thorough";

/**
 * Convert thinking option to token budget.
 * Returns undefined for "off" (thinking disabled).
 */
export function thinkingOptionToTokens(
  option: ThinkingOption,
): number | undefined {
  switch (option) {
    case "light":
      return 4096;
    case "medium":
      return 16000;
    case "thorough":
      return 32000;
    default:
      return undefined;
  }
}

/**
 * Status of a session.
 * - "idle": No active process
 * - "owned": Process is running and owned by this server
 * - "external": Session is being controlled by an external program
 */
export type SessionStatus =
  | { state: "idle" }
  | {
      state: "owned";
      processId: string;
      permissionMode?: PermissionMode;
      modeVersion?: number;
    }
  | { state: "external" };

/**
 * Metadata about a file in a project.
 */
export interface FileMetadata {
  /** File path relative to project root */
  path: string;
  /** File size in bytes */
  size: number;
  /** MIME type (e.g., "text/typescript", "image/png") */
  mimeType: string;
  /** Whether the file is a text file (can be displayed inline) */
  isText: boolean;
}

/**
 * Response from the file content API.
 */
export interface FileContentResponse {
  /** File metadata */
  metadata: FileMetadata;
  /** File content (only for text files under size limit) */
  content?: string;
  /** URL to fetch raw file content */
  rawUrl: string;
}
