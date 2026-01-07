import type { AssistantEntry } from "./entry/AssistantEntrySchema.js";
import type { SystemEntry } from "./entry/SystemEntrySchema.js";
import type { UserEntry } from "./entry/UserEntrySchema.js";
import type { ClaudeSessionEntry } from "./index.js";

/** Check if entry is a compact_boundary system entry */
export function isCompactBoundary(
  entry: ClaudeSessionEntry,
): entry is SystemEntry & { subtype: "compact_boundary" } {
  return (
    entry.type === "system" &&
    "subtype" in entry &&
    entry.subtype === "compact_boundary"
  );
}

/** Get logicalParentUuid if compact_boundary, otherwise undefined */
export function getLogicalParentUuid(
  entry: ClaudeSessionEntry,
): string | undefined {
  if (isCompactBoundary(entry)) {
    return (entry as { logicalParentUuid?: string }).logicalParentUuid;
  }
  return undefined;
}

/** Check if entry is a conversation entry (has message field) */
export function isConversationEntry(
  entry: ClaudeSessionEntry,
): entry is UserEntry | AssistantEntry {
  return entry.type === "user" || entry.type === "assistant";
}

/** Get message content from user/assistant entry */
export function getMessageContent(entry: ClaudeSessionEntry) {
  if (isConversationEntry(entry)) {
    // Use optional chaining for defensive access (handles incomplete mock data in tests)
    return (entry as { message?: { content?: unknown } }).message?.content;
  }
  return undefined;
}
