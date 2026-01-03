/**
 * Session file schemas for Gemini CLI.
 *
 * Gemini persists sessions to ~/.gemini/tmp/<project-hash>/chats/ as JSON files.
 * Each file is a single JSON object containing the full conversation.
 *
 * This is DIFFERENT from the streaming output format (events.ts).
 * Session files contain all messages in a single array.
 *
 * Structure:
 * - sessionId: Unique session identifier
 * - projectHash: Hash of the project directory
 * - startTime: ISO timestamp of session start
 * - lastUpdated: ISO timestamp of last update
 * - messages[]: Array of user and gemini messages
 */

import { z } from "zod";

// =============================================================================
// Tool Call Structures
// =============================================================================

/**
 * Function response from tool execution.
 */
export const GeminiFunctionResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  response: z.object({
    output: z.string(),
  }),
});

export type GeminiFunctionResponse = z.infer<
  typeof GeminiFunctionResponseSchema
>;

/**
 * Tool call result wrapper.
 */
export const GeminiToolCallResultSchema = z.object({
  functionResponse: GeminiFunctionResponseSchema,
});

export type GeminiToolCallResult = z.infer<typeof GeminiToolCallResultSchema>;

/**
 * Tool call in a gemini message.
 */
export const GeminiToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
  result: z.array(GeminiToolCallResultSchema).optional(),
  status: z.enum(["success", "error", "pending"]).optional(),
  timestamp: z.string().optional(),
  resultDisplay: z.string().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  renderOutputAsMarkdown: z.boolean().optional(),
});

export type GeminiToolCall = z.infer<typeof GeminiToolCallSchema>;

// =============================================================================
// Thought/Reasoning Structures
// =============================================================================

/**
 * A single thought/reasoning block.
 */
export const GeminiThoughtSchema = z.object({
  subject: z.string(),
  description: z.string(),
  timestamp: z.string().optional(),
});

export type GeminiThought = z.infer<typeof GeminiThoughtSchema>;

// =============================================================================
// Token Usage
// =============================================================================

/**
 * Token usage breakdown for a message.
 */
export const GeminiTokensSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
  cached: z.number().optional(),
  thoughts: z.number().optional(),
  tool: z.number().optional(),
  total: z.number().optional(),
});

export type GeminiTokens = z.infer<typeof GeminiTokensSchema>;

// =============================================================================
// Message Types
// =============================================================================

/**
 * User message in the conversation.
 */
export const GeminiUserMessageSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: z.literal("user"),
  content: z.string(),
});

export type GeminiUserMessage = z.infer<typeof GeminiUserMessageSchema>;

/**
 * Gemini (assistant) message in the conversation.
 */
export const GeminiAssistantMessageSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: z.literal("gemini"),
  content: z.string(),
  thoughts: z.array(GeminiThoughtSchema).optional(),
  toolCalls: z.array(GeminiToolCallSchema).optional(),
  tokens: GeminiTokensSchema.optional(),
  model: z.string().optional(),
});

export type GeminiAssistantMessage = z.infer<
  typeof GeminiAssistantMessageSchema
>;

/**
 * Union of all message types.
 */
export const GeminiSessionMessageSchema = z.discriminatedUnion("type", [
  GeminiUserMessageSchema,
  GeminiAssistantMessageSchema,
]);

export type GeminiSessionMessage = z.infer<typeof GeminiSessionMessageSchema>;

// =============================================================================
// Session File Structure
// =============================================================================

/**
 * Complete Gemini session file structure.
 * This is the top-level object in ~/.gemini/tmp/<hash>/chats/*.json
 */
export const GeminiSessionFileSchema = z.object({
  sessionId: z.string(),
  projectHash: z.string(),
  startTime: z.string(),
  lastUpdated: z.string(),
  messages: z.array(GeminiSessionMessageSchema),
});

export type GeminiSessionFile = z.infer<typeof GeminiSessionFileSchema>;

/**
 * Parse a Gemini session file.
 * Returns null if parsing fails.
 */
export function parseGeminiSessionFile(
  content: string,
): GeminiSessionFile | null {
  try {
    const json = JSON.parse(content);
    const result = GeminiSessionFileSchema.safeParse(json);
    if (result.success) {
      return result.data;
    }
    // Return raw JSON for forward compatibility
    if (
      json &&
      typeof json === "object" &&
      "sessionId" in json &&
      "messages" in json
    ) {
      return json as GeminiSessionFile;
    }
    return null;
  } catch {
    return null;
  }
}
