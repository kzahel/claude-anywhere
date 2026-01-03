/**
 * Session file schemas for Codex CLI.
 *
 * Codex persists sessions to ~/.codex/sessions/ as JSONL files.
 * Each line is a JSON object with timestamp, type, and payload.
 *
 * This is DIFFERENT from the streaming output format (events.ts).
 * Session files use a wrapper format with explicit payload nesting.
 *
 * Event types in session files:
 * - session_meta: Session initialization metadata
 * - response_item: Message content (user, assistant, reasoning, function calls)
 * - event_msg: Event notifications (user_message, agent_message, token_count, etc.)
 * - turn_context: Per-turn context (cwd, approval policy, model, etc.)
 */

import { z } from "zod";

// =============================================================================
// Session Metadata
// =============================================================================

/**
 * Session metadata payload - first entry in session file.
 */
export const CodexSessionMetaPayloadSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  cwd: z.string(),
  originator: z.string().optional(), // e.g. "codex_exec"
  cli_version: z.string().optional(),
  instructions: z.string().optional(),
  source: z.string().optional(), // e.g. "exec"
  model_provider: z.string().optional(), // e.g. "openai"
});

export type CodexSessionMetaPayload = z.infer<
  typeof CodexSessionMetaPayloadSchema
>;

export const CodexSessionMetaEntrySchema = z.object({
  timestamp: z.string(),
  type: z.literal("session_meta"),
  payload: CodexSessionMetaPayloadSchema,
});

export type CodexSessionMetaEntry = z.infer<typeof CodexSessionMetaEntrySchema>;

// =============================================================================
// Response Item - Messages and Content
// =============================================================================

/**
 * Input text content block in user messages.
 */
export const CodexInputTextContentSchema = z.object({
  type: z.literal("input_text"),
  text: z.string(),
});

/**
 * Output text content block in assistant messages.
 */
export const CodexOutputTextContentSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
});

/**
 * User or assistant message payload.
 */
export const CodexMessagePayloadSchema = z.object({
  type: z.literal("message"),
  role: z.enum(["user", "assistant"]),
  content: z.array(
    z.union([CodexInputTextContentSchema, CodexOutputTextContentSchema]),
  ),
});

export type CodexMessagePayload = z.infer<typeof CodexMessagePayloadSchema>;

/**
 * Reasoning summary block.
 */
export const CodexSummaryTextSchema = z.object({
  type: z.literal("summary_text"),
  text: z.string(),
});

/**
 * Reasoning payload (chain-of-thought, may be encrypted).
 */
export const CodexReasoningPayloadSchema = z.object({
  type: z.literal("reasoning"),
  summary: z.array(CodexSummaryTextSchema).optional(),
  content: z.unknown().nullable().optional(), // Raw content if available
  encrypted_content: z.string().optional(), // Encrypted reasoning
});

export type CodexReasoningPayload = z.infer<typeof CodexReasoningPayloadSchema>;

/**
 * Function call payload.
 */
export const CodexFunctionCallPayloadSchema = z.object({
  type: z.literal("function_call"),
  name: z.string(),
  arguments: z.string(), // JSON string
  call_id: z.string(),
});

export type CodexFunctionCallPayload = z.infer<
  typeof CodexFunctionCallPayloadSchema
>;

/**
 * Function call output payload.
 */
export const CodexFunctionCallOutputPayloadSchema = z.object({
  type: z.literal("function_call_output"),
  call_id: z.string(),
  output: z.string(),
});

export type CodexFunctionCallOutputPayload = z.infer<
  typeof CodexFunctionCallOutputPayloadSchema
>;

/**
 * Ghost commit snapshot for git state tracking.
 */
export const CodexGhostSnapshotPayloadSchema = z.object({
  type: z.literal("ghost_snapshot"),
  ghost_commit: z.object({
    id: z.string(),
    parent: z.string(),
    preexisting_untracked_files: z.array(z.string()).optional(),
    preexisting_untracked_dirs: z.array(z.string()).optional(),
  }),
});

export type CodexGhostSnapshotPayload = z.infer<
  typeof CodexGhostSnapshotPayloadSchema
>;

/**
 * Union of all response item payload types.
 */
export const CodexResponseItemPayloadSchema = z.discriminatedUnion("type", [
  CodexMessagePayloadSchema,
  CodexReasoningPayloadSchema,
  CodexFunctionCallPayloadSchema,
  CodexFunctionCallOutputPayloadSchema,
  CodexGhostSnapshotPayloadSchema,
]);

export type CodexResponseItemPayload = z.infer<
  typeof CodexResponseItemPayloadSchema
>;

export const CodexResponseItemEntrySchema = z.object({
  timestamp: z.string(),
  type: z.literal("response_item"),
  payload: CodexResponseItemPayloadSchema,
});

export type CodexResponseItemEntry = z.infer<
  typeof CodexResponseItemEntrySchema
>;

// =============================================================================
// Event Messages
// =============================================================================

/**
 * Rate limit info.
 */
export const CodexRateLimitsSchema = z.object({
  primary: z
    .object({
      used_percent: z.number(),
      window_minutes: z.number(),
      resets_at: z.number(),
    })
    .optional(),
  secondary: z
    .object({
      used_percent: z.number(),
      window_minutes: z.number(),
      resets_at: z.number(),
    })
    .optional(),
  credits: z
    .object({
      has_credits: z.boolean(),
      unlimited: z.boolean(),
      balance: z.unknown().nullable(),
    })
    .optional(),
  plan_type: z.string().nullable().optional(),
});

/**
 * Token usage info.
 */
export const CodexTokenUsageInfoSchema = z.object({
  total_token_usage: z
    .object({
      input_tokens: z.number(),
      cached_input_tokens: z.number().optional(),
      output_tokens: z.number(),
      reasoning_output_tokens: z.number().optional(),
      total_tokens: z.number(),
    })
    .optional(),
  last_token_usage: z
    .object({
      input_tokens: z.number(),
      cached_input_tokens: z.number().optional(),
      output_tokens: z.number(),
      reasoning_output_tokens: z.number().optional(),
      total_tokens: z.number(),
    })
    .optional(),
  model_context_window: z.number().optional(),
});

/**
 * User message event.
 */
export const CodexUserMessageEventSchema = z.object({
  type: z.literal("user_message"),
  message: z.string(),
  images: z.array(z.unknown()).optional(),
});

/**
 * Agent message event.
 */
export const CodexAgentMessageEventSchema = z.object({
  type: z.literal("agent_message"),
  message: z.string(),
});

/**
 * Agent reasoning event (summary of thinking).
 */
export const CodexAgentReasoningEventSchema = z.object({
  type: z.literal("agent_reasoning"),
  text: z.string(),
});

/**
 * Token count event.
 */
export const CodexTokenCountEventSchema = z.object({
  type: z.literal("token_count"),
  info: CodexTokenUsageInfoSchema.nullable(),
  rate_limits: CodexRateLimitsSchema.optional(),
});

/**
 * Union of event message types.
 */
export const CodexEventMsgPayloadSchema = z.discriminatedUnion("type", [
  CodexUserMessageEventSchema,
  CodexAgentMessageEventSchema,
  CodexAgentReasoningEventSchema,
  CodexTokenCountEventSchema,
]);

export type CodexEventMsgPayload = z.infer<typeof CodexEventMsgPayloadSchema>;

export const CodexEventMsgEntrySchema = z.object({
  timestamp: z.string(),
  type: z.literal("event_msg"),
  payload: CodexEventMsgPayloadSchema,
});

export type CodexEventMsgEntry = z.infer<typeof CodexEventMsgEntrySchema>;

// =============================================================================
// Turn Context
// =============================================================================

/**
 * Sandbox policy configuration.
 */
export const CodexSandboxPolicySchema = z.object({
  type: z.string(),
  network_access: z.boolean().optional(),
  exclude_tmpdir_env_var: z.boolean().optional(),
  exclude_slash_tmp: z.boolean().optional(),
});

/**
 * Turn context payload - sent at the start/end of turns.
 */
export const CodexTurnContextPayloadSchema = z.object({
  cwd: z.string(),
  approval_policy: z.string(),
  sandbox_policy: CodexSandboxPolicySchema.optional(),
  model: z.string().optional(),
  summary: z.string().optional(),
});

export type CodexTurnContextPayload = z.infer<
  typeof CodexTurnContextPayloadSchema
>;

export const CodexTurnContextEntrySchema = z.object({
  timestamp: z.string(),
  type: z.literal("turn_context"),
  payload: CodexTurnContextPayloadSchema,
});

export type CodexTurnContextEntry = z.infer<typeof CodexTurnContextEntrySchema>;

// =============================================================================
// Session Entry Union
// =============================================================================

/**
 * Union of all session file entry types.
 * Use this for parsing individual JSONL lines from ~/.codex/sessions/.
 */
export const CodexSessionEntrySchema = z.discriminatedUnion("type", [
  CodexSessionMetaEntrySchema,
  CodexResponseItemEntrySchema,
  CodexEventMsgEntrySchema,
  CodexTurnContextEntrySchema,
]);

export type CodexSessionEntry = z.infer<typeof CodexSessionEntrySchema>;

/**
 * Parse a JSONL line from a Codex session file.
 * Returns null if parsing fails.
 */
export function parseCodexSessionEntry(line: string): CodexSessionEntry | null {
  try {
    const json = JSON.parse(line);
    const result = CodexSessionEntrySchema.safeParse(json);
    if (result.success) {
      return result.data;
    }
    // Return raw JSON for forward compatibility with unknown types
    if (json && typeof json === "object" && "type" in json) {
      return json as CodexSessionEntry;
    }
    return null;
  } catch {
    return null;
  }
}
