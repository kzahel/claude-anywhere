/**
 * DAG (Directed Acyclic Graph) utilities for JSONL conversation parsing.
 *
 * Claude Code JSONL files are not linear logs - they form a DAG where each
 * message has a `parentUuid` pointing to its predecessor. This enables:
 * - Conversation branching (forking from any point)
 * - Dead branches (abandoned paths remain in file but are unreachable)
 * - Clean recovery (resumption picks any node as continuation point)
 */

/** Raw content block from JSONL - loosely typed to preserve all fields */
interface RawContentBlock {
  type: string;
  id?: string;
  tool_use_id?: string;
  [key: string]: unknown;
}

/** Raw JSONL message format - loosely typed to preserve all fields */
export interface RawSessionMessage {
  type: string;
  subtype?: string;
  message?: {
    content: string | RawContentBlock[];
    [key: string]: unknown;
  };
  uuid?: string;
  parentUuid?: string | null;
  /** For compact_boundary messages, points to the last message before compaction */
  logicalParentUuid?: string | null;
  [key: string]: unknown;
}

/** A node in the conversation DAG */
export interface DagNode {
  uuid: string;
  parentUuid: string | null;
  /** Original position in JSONL file (0-indexed line number) */
  lineIndex: number;
  raw: RawSessionMessage;
}

/** Info about an alternate branch (not selected as active) */
export interface AlternateBranch {
  /** The tip node of this branch */
  tipUuid: string;
  /** Number of messages from root to tip */
  length: number;
  /** Type of the tip message (user/assistant) */
  tipType: string;
}

/** Result of building and traversing the DAG */
export interface DagResult {
  /** Messages on the active branch, in conversation order (root to tip) */
  activeBranch: DagNode[];
  /** UUIDs of all messages on the active branch (for quick lookup) */
  activeBranchUuids: Set<string>;
  /** The tip node (most recent message with no children), or null if empty */
  tip: DagNode | null;
  /** Whether the session has multiple branches (forks detected) */
  hasBranches: boolean;
  /** Info about alternate branches not selected as active */
  alternateBranches: AlternateBranch[];
}

/**
 * Walk from a tip to root, returning the branch length.
 * Also handles compact_boundary nodes by following logicalParentUuid.
 */
function walkBranchLength(
  tipUuid: string,
  nodeMap: Map<string, DagNode>,
): number {
  let length = 0;
  let currentUuid: string | null = tipUuid;
  const visited = new Set<string>();

  while (currentUuid && !visited.has(currentUuid)) {
    visited.add(currentUuid);
    const node = nodeMap.get(currentUuid);
    if (!node) break;

    length++;

    // Determine next node: use parentUuid, or logicalParentUuid for compact_boundary
    let nextUuid = node.parentUuid;
    if (
      !nextUuid &&
      node.raw.type === "system" &&
      node.raw.subtype === "compact_boundary" &&
      node.raw.logicalParentUuid
    ) {
      nextUuid = node.raw.logicalParentUuid;
    }

    currentUuid = nextUuid;
  }

  return length;
}

/**
 * Build a DAG from raw JSONL messages and find the active conversation branch.
 *
 * Algorithm:
 * 1. Build maps: uuid → node, parentUuid → children
 * 2. Find tips: messages with no children
 * 3. Select active tip: longest branch wins (tiebreaker: latest lineIndex)
 * 4. Walk from tip to root via parentUuid chain
 * 5. Return active branch in conversation order (root to tip)
 *
 * Messages without uuid (like queue-operation, file-history-snapshot) are skipped.
 */
export function buildDag(messages: RawSessionMessage[]): DagResult {
  const nodeMap = new Map<string, DagNode>();
  const childrenMap = new Map<string | null, string[]>();

  // Build node map and children map
  for (let lineIndex = 0; lineIndex < messages.length; lineIndex++) {
    const raw = messages[lineIndex];
    if (!raw) continue;

    const uuid = raw.uuid;
    if (!uuid) continue; // Skip messages without uuid (internal types)

    const node: DagNode = {
      uuid,
      parentUuid: raw.parentUuid ?? null,
      lineIndex,
      raw,
    };
    nodeMap.set(uuid, node);

    // Track children for each parent
    const parentKey = raw.parentUuid ?? null;
    const children = childrenMap.get(parentKey);
    if (children) {
      children.push(uuid);
    } else {
      childrenMap.set(parentKey, [uuid]);
    }
  }

  // Find tips (nodes with no children) and calculate branch lengths
  const tipsWithLength: Array<{ node: DagNode; length: number }> = [];
  for (const node of nodeMap.values()) {
    const children = childrenMap.get(node.uuid);
    if (!children || children.length === 0) {
      const length = walkBranchLength(node.uuid, nodeMap);
      tipsWithLength.push({ node, length });
    }
  }

  // Select the "active" tip: longest branch wins, tiebreaker is latest lineIndex
  // This ensures we show the most complete conversation, not just the most recent append
  const selectedTip =
    tipsWithLength.length > 0
      ? tipsWithLength.reduce((best, current) => {
          if (current.length > best.length) return current;
          if (
            current.length === best.length &&
            current.node.lineIndex > best.node.lineIndex
          ) {
            return current;
          }
          return best;
        })
      : null;

  const tip = selectedTip?.node ?? null;
  const hasBranches = tipsWithLength.length > 1;

  // Build alternate branches info (all tips except the selected one)
  const alternateBranches: AlternateBranch[] = hasBranches
    ? tipsWithLength
        .filter((t) => t.node.uuid !== tip?.uuid)
        .map((t) => ({
          tipUuid: t.node.uuid,
          length: t.length,
          tipType: t.node.raw.type,
        }))
        .sort((a, b) => b.length - a.length) // Sort by length descending
    : [];

  // Walk from tip to root, collecting the active branch
  const activeBranch: DagNode[] = [];
  const activeBranchUuids = new Set<string>();
  const visited = new Set<string>(); // Cycle detection (defensive)

  let current: DagNode | null = tip;
  while (current && !visited.has(current.uuid)) {
    visited.add(current.uuid);
    activeBranch.unshift(current); // Prepend to maintain root→tip order
    activeBranchUuids.add(current.uuid);

    // Determine next node: use parentUuid, or logicalParentUuid for compact_boundary
    let nextUuid = current.parentUuid;
    if (
      !nextUuid &&
      current.raw.type === "system" &&
      current.raw.subtype === "compact_boundary" &&
      current.raw.logicalParentUuid
    ) {
      // Follow the logical parent chain across the compaction boundary
      nextUuid = current.raw.logicalParentUuid;
    }

    current = nextUuid ? (nodeMap.get(nextUuid) ?? null) : null;
  }

  return {
    activeBranch,
    activeBranchUuids,
    tip,
    hasBranches,
    alternateBranches,
  };
}

/**
 * Find orphaned tool_use blocks on the active branch.
 *
 * A tool_use is orphaned if its ID doesn't have a matching tool_result
 * on the active branch. This happens when a process is killed while
 * waiting for tool approval or during tool execution.
 */
export function findOrphanedToolUses(activeBranch: DagNode[]): Set<string> {
  const toolUseIds = new Set<string>();
  const toolResultIds = new Set<string>();

  for (const node of activeBranch) {
    const content = node.raw.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type === "tool_use" && block.id) {
        toolUseIds.add(block.id);
      }
      if (block.type === "tool_result" && block.tool_use_id) {
        toolResultIds.add(block.tool_use_id);
      }
    }
  }

  // Orphaned = tool_use without matching tool_result
  const orphaned = new Set<string>();
  for (const id of toolUseIds) {
    if (!toolResultIds.has(id)) {
      orphaned.add(id);
    }
  }

  return orphaned;
}
