/**
 * OpenCode Schema
 *
 * Zod schemas for parsing OpenCode server SSE events.
 * Based on the event types from `opencode serve` HTTP/SSE API.
 *
 * Event types:
 * - server.connected: Initial connection established
 * - session.status: Session busy/idle state changes
 * - session.updated: Session metadata updated
 * - session.idle: Session finished processing
 * - message.updated: Message metadata updated
 * - message.part.updated: Message content streaming (with delta)
 * - session.diff: File diff information
 */

export * from "./events.js";
export * from "./types.js";
