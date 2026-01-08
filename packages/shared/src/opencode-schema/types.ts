/**
 * Type-only exports for OpenCode schema.
 * Import from here to avoid pulling in Zod runtime.
 */

export type {
  OpenCodeSessionStatus,
  OpenCodeTokens,
  OpenCodeTime,
  OpenCodePart,
  OpenCodeMessageInfo,
  OpenCodeSessionInfo,
  OpenCodeServerConnectedEvent,
  OpenCodeSessionStatusEvent,
  OpenCodeSessionUpdatedEvent,
  OpenCodeSessionIdleEvent,
  OpenCodeSessionDiffEvent,
  OpenCodeMessageUpdatedEvent,
  OpenCodeMessagePartUpdatedEvent,
  OpenCodeSSEEvent,
} from "./events.js";
