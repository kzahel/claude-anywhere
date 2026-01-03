/**
 * Type-only exports for Codex schema.
 * Import from here to avoid pulling in Zod runtime.
 */

// Content types (used by session files)
export type {
  CodexTextContent,
  CodexToolUseContent,
  CodexToolResultContent,
  CodexReasoningContent,
  CodexContentBlock,
  CodexMessageContent,
} from "./content.js";

// Session file types (persisted format in ~/.codex/sessions/)
export type {
  CodexSessionMetaPayload,
  CodexSessionMetaEntry,
  CodexMessagePayload,
  CodexReasoningPayload,
  CodexFunctionCallPayload,
  CodexFunctionCallOutputPayload,
  CodexGhostSnapshotPayload,
  CodexResponseItemPayload,
  CodexResponseItemEntry,
  CodexEventMsgPayload,
  CodexEventMsgEntry,
  CodexTurnContextPayload,
  CodexTurnContextEntry,
  CodexSessionEntry,
} from "./session.js";
