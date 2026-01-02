import type { ContentBlock, Message } from "../types";

/**
 * Represents a pending Task (Task tool_use without matching tool_result).
 */
export interface PendingTask {
  /** The tool_use block ID */
  toolUseId: string;
  /** Task description from input */
  description: string;
  /** Subagent type from input */
  subagentType: string;
}

/**
 * Find pending Tasks in a list of messages.
 *
 * A pending Task is a Task tool_use block that doesn't have a matching tool_result.
 * This happens when:
 * - Task is currently running (no result yet)
 * - Page was reloaded mid-task
 * - Process was interrupted
 *
 * @param messages - Array of messages from the session
 * @returns Array of pending Task info
 */
export function findPendingTasks(messages: Message[]): PendingTask[] {
  const taskToolUses = new Map<
    string,
    { description: string; subagentType: string }
  >();
  const completedIds = new Set<string>();

  for (const msg of messages) {
    // Get content from nested message object (SDK structure) first, fall back to top-level
    // Phase 4c: prefer message.content over top-level content
    const content =
      (msg.message as { content?: string | ContentBlock[] } | undefined)
        ?.content ?? msg.content;

    if (!Array.isArray(content)) continue;

    for (const block of content) {
      // Find Task tool_use blocks
      if (
        block.type === "tool_use" &&
        block.name === "Task" &&
        typeof block.id === "string"
      ) {
        const input = block.input as
          | {
              description?: string;
              subagent_type?: string;
            }
          | undefined;
        taskToolUses.set(block.id, {
          description: input?.description ?? "Unknown task",
          subagentType: input?.subagent_type ?? "unknown",
        });
      }

      // Find tool_result blocks
      if (
        block.type === "tool_result" &&
        typeof block.tool_use_id === "string"
      ) {
        completedIds.add(block.tool_use_id);
      }
    }
  }

  // Return tasks that don't have a matching result
  return [...taskToolUses.entries()]
    .filter(([id]) => !completedIds.has(id))
    .map(([toolUseId, { description, subagentType }]) => ({
      toolUseId,
      description,
      subagentType,
    }));
}
