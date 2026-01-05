import type { ContentBlock, Message } from "../types";

/**
 * RenderItem types for the preprocessed message rendering system.
 *
 * Instead of rendering Message[] directly, we preprocess into RenderItem[]
 * that pairs tool_use with tool_result for unified display.
 */

export type RenderItem =
  | TextItem
  | ThinkingItem
  | ToolCallItem
  | UserPromptItem;

/** Base fields shared by all render items */
interface RenderItemBase {
  /** Source JSONL messages that contributed to this item (for debugging) */
  sourceMessages: Message[];
  /** True if this item is from a Task subagent */
  isSubagent?: boolean;
}

export interface TextItem extends RenderItemBase {
  type: "text";
  /** Unique ID for React key (format: messageId-contentBlockIndex) */
  id: string;
  /**
   * ID for looking up pre-rendered markdown augments (format: messageId-0).
   * During streaming, all markdown blocks are concatenated and stored at messageId-0.
   * This differs from `id` when the text block isn't at content index 0
   * (e.g., when there's a thinking block before text).
   */
  augmentId: string;
  text: string;
  /** True if this text is still being streamed */
  isStreaming?: boolean;
}

export interface ThinkingItem extends RenderItemBase {
  type: "thinking";
  id: string;
  thinking: string;
  signature?: string;
  status: "streaming" | "complete";
}

export interface ToolCallItem extends RenderItemBase {
  type: "tool_call";
  id: string; // tool_use.id
  toolName: string; // tool_use.name
  toolInput: unknown; // tool_use.input
  toolResult?: ToolResultData; // undefined while pending
  status: "pending" | "complete" | "error" | "aborted";
}

export interface ToolResultData {
  content: string;
  isError: boolean;
  /** Structured result from JSONL toolUseResult field */
  structured?: unknown;
}

export interface UserPromptItem extends RenderItemBase {
  type: "user_prompt";
  id: string;
  content: string | ContentBlock[];
}
