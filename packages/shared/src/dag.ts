/**
 * DAG (Directed Acyclic Graph) utilities for parent chain ordering.
 *
 * Messages form a chain via parentUuid: root (null) → ... → tip
 * These utilities help reorder messages when they arrive out of order
 * (e.g., due to race conditions between SSE and JSONL loading).
 */

/**
 * Interface for items that can be ordered by parent chain.
 * Items must have at least one of `uuid` or `id` for identification.
 */
export interface DagOrderable {
  uuid?: string;
  id?: string;
  parentUuid?: string | null;
}

/**
 * Get the canonical ID for a DagOrderable item, preferring uuid over id.
 */
function getDagId(item: DagOrderable): string {
  return item.uuid ?? item.id ?? "";
}

/**
 * Check if items need reordering by verifying each item's parent
 * appears before it in the list. O(n) with just Set operations.
 *
 * @returns true if reordering is needed, false if already correctly ordered
 */
export function needsReorder<T extends DagOrderable>(items: T[]): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    if (item.parentUuid && !seen.has(item.parentUuid)) {
      return true;
    }
    seen.add(getDagId(item));
  }
  return false;
}

/**
 * Order items by walking the parentUuid chain.
 * Items form a chain: root (parentUuid=null) → ... → tip
 *
 * Performance:
 * - Early bailout via needsReorder() check - O(n) with Set operations only
 * - Full reorder only when needed (race condition): O(n) with Map building
 *
 * Items without parentUuid or not connected to the chain are appended at the end.
 */
export function orderByParentChain<T extends DagOrderable>(items: T[]): T[] {
  if (items.length <= 1) return items;
  if (!needsReorder(items)) return items;

  // Build parent→children map
  const children = new Map<string | null, T[]>();
  for (const item of items) {
    const parentKey = item.parentUuid ?? null;
    const siblings = children.get(parentKey) ?? [];
    siblings.push(item);
    children.set(parentKey, siblings);
  }

  // Walk from roots, building ordered result
  const result: T[] = [];
  const visited = new Set<string>();

  function visit(parentId: string | null) {
    for (const item of children.get(parentId) ?? []) {
      const itemId = getDagId(item);
      if (visited.has(itemId)) continue;
      visited.add(itemId);
      result.push(item);
      visit(itemId);
    }
  }

  visit(null);

  // Append unvisited items (those not in the parentUuid chain)
  for (const item of items) {
    if (!visited.has(getDagId(item))) {
      result.push(item);
    }
  }

  return result;
}
