/**
 * Type-only exports for Gemini schema.
 * Import from here to avoid pulling in Zod runtime.
 */

export type {
  GeminiStats,
  GeminiInitEvent,
  GeminiMessageEvent,
  GeminiToolUseEvent,
  GeminiToolResultEvent,
  GeminiResultEvent,
  GeminiErrorEvent,
  GeminiEvent,
} from "./events.js";

// Session file types (persisted format)
export type {
  GeminiFunctionResponse,
  GeminiToolCallResult,
  GeminiToolCall,
  GeminiThought,
  GeminiTokens,
  GeminiUserMessage,
  GeminiAssistantMessage,
  GeminiSessionMessage,
  GeminiSessionFile,
} from "./session.js";
