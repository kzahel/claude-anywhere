/**
 * Event schemas for OpenCode server SSE events.
 *
 * OpenCode server emits Server-Sent Events (SSE) with these types:
 * - server.connected: Initial connection established
 * - session.status: Session busy/idle state changes
 * - session.updated: Session metadata updated
 * - session.idle: Session finished processing
 * - message.updated: Message metadata updated
 * - message.part.updated: Message content streaming (with delta)
 * - session.diff: File diff information
 */

import { z } from "zod";

/**
 * Session status from OpenCode (busy or idle).
 */
export const OpenCodeSessionStatusSchema = z.object({
  type: z.enum(["busy", "idle"]),
});

export type OpenCodeSessionStatus = z.infer<typeof OpenCodeSessionStatusSchema>;

/**
 * Token usage stats from OpenCode.
 */
export const OpenCodeTokensSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
  reasoning: z.number().optional(),
  cache: z
    .object({
      read: z.number().optional(),
      write: z.number().optional(),
    })
    .optional(),
});

export type OpenCodeTokens = z.infer<typeof OpenCodeTokensSchema>;

/**
 * Time information for parts/messages.
 */
export const OpenCodeTimeSchema = z.object({
  start: z.number().optional(),
  end: z.number().optional(),
  created: z.number().optional(),
  updated: z.number().optional(),
  completed: z.number().optional(),
});

export type OpenCodeTime = z.infer<typeof OpenCodeTimeSchema>;

/**
 * Message part - the streaming content unit.
 */
export const OpenCodePartSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  type: z.string(), // "text", "step-start", "step-finish", "tool-use", "tool-result", etc.
  text: z.string().optional(),
  time: OpenCodeTimeSchema.optional(),
  // step-finish specific fields
  reason: z.string().optional(),
  snapshot: z.string().optional(),
  cost: z.number().optional(),
  tokens: OpenCodeTokensSchema.optional(),
  // tool-use specific fields
  tool: z.string().optional(),
  input: z.unknown().optional(),
  // tool-result specific fields
  output: z.unknown().optional(),
  error: z.string().optional(),
});

export type OpenCodePart = z.infer<typeof OpenCodePartSchema>;

/**
 * Message info - metadata about a message.
 */
export const OpenCodeMessageInfoSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  role: z.enum(["user", "assistant"]),
  time: OpenCodeTimeSchema.optional(),
  parentID: z.string().optional(),
  modelID: z.string().optional(),
  providerID: z.string().optional(),
  mode: z.string().optional(),
  agent: z.string().optional(),
  path: z
    .object({
      cwd: z.string().optional(),
      root: z.string().optional(),
    })
    .optional(),
  cost: z.number().optional(),
  tokens: OpenCodeTokensSchema.optional(),
  finish: z.string().optional(),
  summary: z
    .object({
      title: z.string().optional(),
      diffs: z.array(z.unknown()).optional(),
    })
    .optional(),
  model: z
    .object({
      providerID: z.string().optional(),
      modelID: z.string().optional(),
    })
    .optional(),
});

export type OpenCodeMessageInfo = z.infer<typeof OpenCodeMessageInfoSchema>;

/**
 * Session info - metadata about a session.
 */
export const OpenCodeSessionInfoSchema = z.object({
  id: z.string(),
  version: z.string().optional(),
  projectID: z.string().optional(),
  directory: z.string().optional(),
  title: z.string().optional(),
  time: OpenCodeTimeSchema.optional(),
  summary: z
    .object({
      additions: z.number().optional(),
      deletions: z.number().optional(),
      files: z.number().optional(),
    })
    .optional(),
});

export type OpenCodeSessionInfo = z.infer<typeof OpenCodeSessionInfoSchema>;

// ============ SSE Event Types ============

/**
 * Server connected event.
 */
export const OpenCodeServerConnectedEventSchema = z.object({
  type: z.literal("server.connected"),
  properties: z.object({}).optional(),
});

export type OpenCodeServerConnectedEvent = z.infer<
  typeof OpenCodeServerConnectedEventSchema
>;

/**
 * Session status event.
 */
export const OpenCodeSessionStatusEventSchema = z.object({
  type: z.literal("session.status"),
  properties: z.object({
    sessionID: z.string(),
    status: OpenCodeSessionStatusSchema,
  }),
});

export type OpenCodeSessionStatusEvent = z.infer<
  typeof OpenCodeSessionStatusEventSchema
>;

/**
 * Session updated event.
 */
export const OpenCodeSessionUpdatedEventSchema = z.object({
  type: z.literal("session.updated"),
  properties: z.object({
    info: OpenCodeSessionInfoSchema,
  }),
});

export type OpenCodeSessionUpdatedEvent = z.infer<
  typeof OpenCodeSessionUpdatedEventSchema
>;

/**
 * Session idle event.
 */
export const OpenCodeSessionIdleEventSchema = z.object({
  type: z.literal("session.idle"),
  properties: z.object({
    sessionID: z.string(),
  }),
});

export type OpenCodeSessionIdleEvent = z.infer<
  typeof OpenCodeSessionIdleEventSchema
>;

/**
 * Session diff event.
 */
export const OpenCodeSessionDiffEventSchema = z.object({
  type: z.literal("session.diff"),
  properties: z.object({
    sessionID: z.string(),
    diff: z.array(z.unknown()),
  }),
});

export type OpenCodeSessionDiffEvent = z.infer<
  typeof OpenCodeSessionDiffEventSchema
>;

/**
 * Message updated event.
 */
export const OpenCodeMessageUpdatedEventSchema = z.object({
  type: z.literal("message.updated"),
  properties: z.object({
    info: OpenCodeMessageInfoSchema,
  }),
});

export type OpenCodeMessageUpdatedEvent = z.infer<
  typeof OpenCodeMessageUpdatedEventSchema
>;

/**
 * Message part updated event (streaming content).
 */
export const OpenCodeMessagePartUpdatedEventSchema = z.object({
  type: z.literal("message.part.updated"),
  properties: z.object({
    part: OpenCodePartSchema,
    delta: z.string().optional(), // Streaming text delta
  }),
});

export type OpenCodeMessagePartUpdatedEvent = z.infer<
  typeof OpenCodeMessagePartUpdatedEventSchema
>;

/**
 * Union of all OpenCode SSE event types.
 */
export const OpenCodeSSEEventSchema = z.discriminatedUnion("type", [
  OpenCodeServerConnectedEventSchema,
  OpenCodeSessionStatusEventSchema,
  OpenCodeSessionUpdatedEventSchema,
  OpenCodeSessionIdleEventSchema,
  OpenCodeSessionDiffEventSchema,
  OpenCodeMessageUpdatedEventSchema,
  OpenCodeMessagePartUpdatedEventSchema,
]);

export type OpenCodeSSEEvent = z.infer<typeof OpenCodeSSEEventSchema>;

/**
 * Parse an SSE data line into an OpenCode event.
 * Returns null if parsing fails.
 */
export function parseOpenCodeSSEEvent(data: string): OpenCodeSSEEvent | null {
  try {
    const json = JSON.parse(data);
    const result = OpenCodeSSEEventSchema.safeParse(json);
    if (result.success) {
      return result.data;
    }
    // Return as unknown event for forward compatibility
    if (json && typeof json === "object" && "type" in json) {
      return json as OpenCodeSSEEvent;
    }
    return null;
  } catch {
    return null;
  }
}
