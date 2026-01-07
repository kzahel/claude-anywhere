import { z } from "zod";
import {
  type AssistantEntry,
  AssistantEntrySchema,
} from "./entry/AssistantEntrySchema.js";
import { FileHistorySnapshotEntrySchema } from "./entry/FileHistorySnapshotEntrySchema.js";
import { QueueOperationEntrySchema } from "./entry/QueueOperationEntrySchema.js";
import { SummaryEntrySchema } from "./entry/SummaryEntrySchema.js";
import {
  type SystemEntry,
  SystemEntrySchema,
} from "./entry/SystemEntrySchema.js";
import { type UserEntry, UserEntrySchema } from "./entry/UserEntrySchema.js";

export const SessionEntrySchema = z.union([
  UserEntrySchema,
  AssistantEntrySchema,
  SummaryEntrySchema,
  SystemEntrySchema,
  FileHistorySnapshotEntrySchema,
  QueueOperationEntrySchema,
]);

export type SessionEntry = z.infer<typeof SessionEntrySchema>;
export type SidechainEntry = UserEntry | AssistantEntry | SystemEntry;

// Aliases for clarity when working with Claude-specific session data
export type ClaudeSessionEntry = SessionEntry;
export const ClaudeSessionEntrySchema = SessionEntrySchema;
export type ClaudeSidechainEntry = SidechainEntry;

// Re-export all schemas and types for convenience
export * from "./entry/AssistantEntrySchema.js";
export * from "./entry/BaseEntrySchema.js";
export * from "./entry/FileHistorySnapshotEntrySchema.js";
export * from "./entry/normalizeQueueOperationContent.js";
export * from "./entry/QueueOperationEntrySchema.js";
export * from "./entry/SummaryEntrySchema.js";
export * from "./entry/SystemEntrySchema.js";
export * from "./entry/UserEntrySchema.js";

export * from "./message/AssistantMessageSchema.js";
export * from "./message/UserMessageSchema.js";

export * from "./content/DocumentContentSchema.js";
export * from "./content/ImageContentSchema.js";
export * from "./content/TextContentSchema.js";
export * from "./content/ThinkingContentSchema.js";
export * from "./content/ToolResultContentSchema.js";
export * from "./content/ToolUseContentSchema.js";

export * from "./tool/CommonToolSchema.js";
export * from "./tool/StructuredPatchSchema.js";
export * from "./tool/TodoSchema.js";
export { ToolUseResultSchema } from "./tool/index.js";

export * from "./guards.js";
