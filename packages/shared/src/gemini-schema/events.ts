/**
 * Event schemas for Gemini CLI stream-json output.
 *
 * Gemini CLI emits JSON objects with these types:
 * - init: Session initialization with model and session_id
 * - message: User or assistant messages (distinguished by role)
 * - tool_use: Tool invocation
 * - tool_result: Tool execution result
 * - result: Final result with stats
 * - error: Error messages
 */

import { z } from "zod";

/**
 * Stats from the result event.
 */
export const GeminiStatsSchema = z.object({
  total_tokens: z.number().optional(),
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cached: z.number().optional(),
  input: z.number().optional(),
  duration_ms: z.number().optional(),
  tool_calls: z.number().optional(),
});

export type GeminiStats = z.infer<typeof GeminiStatsSchema>;

/**
 * Init event - session start.
 */
export const GeminiInitEventSchema = z.object({
  type: z.literal("init"),
  timestamp: z.string().optional(),
  session_id: z.string(),
  model: z.string().optional(),
});

export type GeminiInitEvent = z.infer<typeof GeminiInitEventSchema>;

/**
 * Message event - user or assistant messages.
 */
export const GeminiMessageEventSchema = z.object({
  type: z.literal("message"),
  timestamp: z.string().optional(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  delta: z.boolean().optional(),
});

export type GeminiMessageEvent = z.infer<typeof GeminiMessageEventSchema>;

/**
 * Tool use event - tool invocation.
 */
export const GeminiToolUseEventSchema = z.object({
  type: z.literal("tool_use"),
  timestamp: z.string().optional(),
  tool_name: z.string(),
  tool_id: z.string(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export type GeminiToolUseEvent = z.infer<typeof GeminiToolUseEventSchema>;

/**
 * Tool result event - tool execution result.
 */
export const GeminiToolResultEventSchema = z.object({
  type: z.literal("tool_result"),
  timestamp: z.string().optional(),
  tool_id: z.string(),
  status: z.enum(["success", "error"]),
  output: z.string().optional(),
  error: z.string().optional(),
});

export type GeminiToolResultEvent = z.infer<typeof GeminiToolResultEventSchema>;

/**
 * Result event - final result with stats.
 */
export const GeminiResultEventSchema = z.object({
  type: z.literal("result"),
  timestamp: z.string().optional(),
  status: z.enum(["success", "error", "cancelled"]),
  stats: GeminiStatsSchema.optional(),
  error: z.string().optional(),
});

export type GeminiResultEvent = z.infer<typeof GeminiResultEventSchema>;

/**
 * Error event.
 */
export const GeminiErrorEventSchema = z.object({
  type: z.literal("error"),
  timestamp: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
});

export type GeminiErrorEvent = z.infer<typeof GeminiErrorEventSchema>;

/**
 * Union of all Gemini event types.
 */
export const GeminiEventSchema = z.discriminatedUnion("type", [
  GeminiInitEventSchema,
  GeminiMessageEventSchema,
  GeminiToolUseEventSchema,
  GeminiToolResultEventSchema,
  GeminiResultEventSchema,
  GeminiErrorEventSchema,
]);

export type GeminiEvent = z.infer<typeof GeminiEventSchema>;

/**
 * Parse a JSON line into a GeminiEvent.
 * Returns null if parsing fails.
 */
export function parseGeminiEvent(line: string): GeminiEvent | null {
  try {
    const json = JSON.parse(line);
    const result = GeminiEventSchema.safeParse(json);
    if (result.success) {
      return result.data;
    }
    // Return as unknown event for forward compatibility
    if (json && typeof json === "object" && "type" in json) {
      return json as GeminiEvent;
    }
    return null;
  } catch {
    return null;
  }
}
