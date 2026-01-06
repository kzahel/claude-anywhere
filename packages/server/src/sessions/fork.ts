/**
 * Session cloning and forking utilities.
 *
 * Supports cloning sessions across providers:
 * - Claude: JSONL with DAG structure (uuid/parentUuid)
 * - Codex: JSONL linear format (TODO)
 * - Gemini: JSON linear format (TODO)
 */

import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Result of cloning a session.
 */
export interface CloneResult {
  /** The new session ID */
  newSessionId: string;
  /** Number of JSONL entries copied */
  entries: number;
}

/**
 * Clone a Claude session by copying the JSONL file with a new session_id.
 *
 * The clone copies the entire conversation history, preserving:
 * - All messages (user, assistant, system)
 * - DAG structure (uuid/parentUuid relationships)
 * - Tool use history
 *
 * The only change is the session_id field (when present) is updated to the new ID.
 *
 * @param sessionDir - Directory containing session JSONL files
 * @param sourceSessionId - The session ID to clone
 * @param newSessionId - Optional new session ID (generated if not provided)
 * @returns Clone result with new session ID and entry count
 */
export async function cloneClaudeSession(
  sessionDir: string,
  sourceSessionId: string,
  newSessionId?: string,
): Promise<CloneResult> {
  const sourcePath = join(sessionDir, `${sourceSessionId}.jsonl`);
  const content = await readFile(sourcePath, "utf-8");
  const trimmed = content.trim();

  if (!trimmed) {
    throw new Error("Source session is empty");
  }

  const lines = trimmed.split("\n");
  const targetId = newSessionId ?? randomUUID();

  // Transform each line: update session_id if present
  const transformedLines = lines.map((line) => {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;

      // Update session_id if present (some entries have it, some don't)
      if ("session_id" in entry) {
        entry.session_id = targetId;
      }

      return JSON.stringify(entry);
    } catch {
      // Keep malformed lines as-is (shouldn't happen, but be safe)
      return line;
    }
  });

  const targetPath = join(sessionDir, `${targetId}.jsonl`);
  await writeFile(targetPath, `${transformedLines.join("\n")}\n`, "utf-8");

  return {
    newSessionId: targetId,
    entries: lines.length,
  };
}
