/**
 * Provider exports.
 *
 * Re-exports all provider implementations and types.
 */

// Types
import type { AgentProvider, ProviderName } from "./types.js";
export type {
  AgentProvider,
  AgentSession,
  AuthStatus,
  ProviderName,
  StartSessionOptions,
} from "./types.js";

// Claude provider (uses @anthropic-ai/claude-agent-sdk)
import { claudeProvider } from "./claude.js";
export { ClaudeProvider, claudeProvider } from "./claude.js";

// Codex provider (uses codex CLI)
import { codexProvider } from "./codex.js";
export {
  CodexProvider,
  codexProvider,
  type CodexProviderConfig,
} from "./codex.js";

// Gemini provider (uses gemini CLI)
import { geminiProvider } from "./gemini.js";
export {
  GeminiProvider,
  geminiProvider,
  type GeminiProviderConfig,
} from "./gemini.js";

// CodexOSS provider (uses codex CLI with --oss for local models)
import { codexOSSProvider } from "./codex-oss.js";
export {
  CodexOSSProvider,
  codexOSSProvider,
  type CodexOSSProviderConfig,
} from "./codex-oss.js";

// OpenCode provider (uses opencode serve for multi-provider agent)
import { opencodeProvider } from "./opencode.js";
export {
  OpenCodeProvider,
  opencodeProvider,
  type OpenCodeProviderConfig,
} from "./opencode.js";

/**
 * Get all available provider instances.
 * Useful for provider detection UI.
 */
export function getAllProviders(): AgentProvider[] {
  return [
    claudeProvider,
    codexProvider,
    codexOSSProvider,
    geminiProvider,
    opencodeProvider,
  ];
}

/**
 * Get a provider by name.
 */
export function getProvider(name: ProviderName): AgentProvider | null {
  switch (name) {
    case "claude":
      return claudeProvider;
    case "codex":
      return codexProvider;
    case "codex-oss":
      return codexOSSProvider;
    case "gemini":
      return geminiProvider;
    case "opencode":
      return opencodeProvider;
    default:
      return null;
  }
}
