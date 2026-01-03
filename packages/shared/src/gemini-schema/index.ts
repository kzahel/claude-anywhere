/**
 * Gemini SDK Schema
 *
 * Zod schemas for parsing Gemini CLI stream-json output.
 * Based on the event types from `gemini -o stream-json`.
 *
 * Event types:
 * - init: Session initialization with model and session_id
 * - message: User or assistant messages (distinguished by role)
 * - tool_use: Tool invocation
 * - tool_result: Tool execution result
 * - result: Final result with stats
 * - error: Error messages
 */

export * from "./events.js";
export * from "./session.js";
export * from "./types.js";
