/**
 * Type-only exports from SDK schemas.
 *
 * This file re-exports only the TypeScript types inferred from Zod schemas,
 * without importing Zod itself. Use this when you only need types and want
 * to avoid bundling the Zod runtime (e.g., in client code).
 *
 * For schemas (runtime validation), import from "./index.js" instead.
 */

// Entry types (JSONL line types)
export type { AssistantEntry } from "./entry/AssistantEntrySchema.js";
export type { UserEntry } from "./entry/UserEntrySchema.js";
export type { SystemEntry } from "./entry/SystemEntrySchema.js";
export type { SummaryEntry } from "./entry/SummaryEntrySchema.js";
export type { FileHistorySnapshotEntry } from "./entry/FileHistorySnapshotEntrySchema.js";
export type { QueueOperationEntry } from "./entry/QueueOperationEntrySchema.js";

// Composite entry types
export type { SessionEntry, SidechainEntry } from "./index.js";

// Message types
export type { AssistantMessageContent } from "./message/AssistantMessageSchema.js";
export type { UserMessageContent } from "./message/UserMessageSchema.js";

// Content types
export type { ToolResultContent } from "./content/ToolResultContentSchema.js";

// Re-export inferred types from schemas that don't have explicit type exports
// These are inferred at the point of use via z.infer<typeof Schema>
import type { z } from "zod";
import type { DocumentContentSchema } from "./content/DocumentContentSchema.js";
import type { ImageContentSchema } from "./content/ImageContentSchema.js";
import type { TextContentSchema } from "./content/TextContentSchema.js";
import type { ThinkingContentSchema } from "./content/ThinkingContentSchema.js";
import type { ToolUseContentSchema } from "./content/ToolUseContentSchema.js";
import type { BaseEntrySchema } from "./entry/BaseEntrySchema.js";
import type { AssistantMessageSchema } from "./message/AssistantMessageSchema.js";
import type { UserMessageSchema } from "./message/UserMessageSchema.js";
import type { StructuredPatchSchema } from "./tool/StructuredPatchSchema.js";
import type { ToolUseResultSchema } from "./tool/index.js";

// Content block types
export type TextContent = z.infer<typeof TextContentSchema>;
export type ThinkingContent = z.infer<typeof ThinkingContentSchema>;
export type ToolUseContent = z.infer<typeof ToolUseContentSchema>;
export type ImageContent = z.infer<typeof ImageContentSchema>;
export type DocumentContent = z.infer<typeof DocumentContentSchema>;

// Message types
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;
export type UserMessage = z.infer<typeof UserMessageSchema>;

// Tool types
export type StructuredPatch = z.infer<typeof StructuredPatchSchema>;
export type ToolUseResult = z.infer<typeof ToolUseResultSchema>;

// Base entry type
export type BaseEntry = z.infer<typeof BaseEntrySchema>;
