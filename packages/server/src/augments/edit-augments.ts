/**
 * Edit augment service - computes structuredPatch and highlighted diff HTML
 * for Edit tool_use blocks.
 *
 * This enables consistent unified diff display for both pending (tool_use)
 * and completed (tool_result) edits.
 */

import type { EditAugment, PatchHunk } from "@yep-anywhere/shared";
import { diffWordsWithSpace, structuredPatch } from "diff";
import { getLanguageForPath, highlightCode } from "../highlighting/index.js";

/** Number of context lines to include in the diff */
const CONTEXT_LINES = 3;

/**
 * Input for computing an edit augment.
 */
export interface EditInput {
  file_path: string;
  old_string: string;
  new_string: string;
}

/**
 * Convert jsdiff patch hunks to our PatchHunk format.
 * jsdiff hunks have the same structure but we need to add line prefixes.
 */
function convertHunks(
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>,
): PatchHunk[] {
  return hunks.map((hunk) => ({
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    // Filter out "\ No newline at end of file" - not useful for UI display
    lines: hunk.lines.filter((line) => line !== "\\ No newline at end of file"),
  }));
}

/**
 * Convert structured patch hunks to unified diff text for highlighting.
 */
function patchToUnifiedText(hunks: PatchHunk[]): string {
  const lines: string[] = [];

  for (const hunk of hunks) {
    // Add hunk header
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    );
    // Add diff lines (already prefixed with ' ', '-', or '+')
    lines.push(...hunk.lines);
  }

  return lines.join("\n");
}

/**
 * Extract the inner content of each <span class="line">...</span> from Shiki HTML.
 * Handles nested spans by counting depth.
 */
function extractShikiLines(html: string): string[] {
  const lines: string[] = [];
  const lineStartRegex = /<span class="line">/g;
  let match: RegExpExecArray | null = lineStartRegex.exec(html);

  while (match !== null) {
    const startPos = match.index + match[0].length;
    let depth = 1;
    let pos = startPos;

    // Find the matching closing </span> by tracking nesting depth
    while (depth > 0 && pos < html.length) {
      const nextOpen = html.indexOf("<span", pos);
      const nextClose = html.indexOf("</span>", pos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 5; // Move past "<span"
      } else {
        depth--;
        if (depth === 0) {
          lines.push(html.slice(startPos, nextClose));
        }
        pos = nextClose + 7; // Move past "</span>"
      }
    }
    match = lineStartRegex.exec(html);
  }

  return lines;
}

/**
 * Information about word-level diffs for specific lines within a hunk.
 */
interface HunkWordDiffs {
  /** Map from old line index (0-based within oldLines array) to word diff */
  oldLineDiffs: Map<number, WordDiffSegment[]>;
  /** Map from new line index (0-based within newLines array) to word diff */
  newLineDiffs: Map<number, WordDiffSegment[]>;
}

/**
 * Pre-compute word diffs for replacement pairs in a hunk.
 * Returns maps from line indices to word diffs.
 */
function computeHunkWordDiffs(
  hunk: PatchHunk,
  hunkOldStartIdx: number, // Starting index in oldLines for this hunk
  hunkNewStartIdx: number, // Starting index in newLines for this hunk
): HunkWordDiffs {
  const oldLineDiffs = new Map<number, WordDiffSegment[]>();
  const newLineDiffs = new Map<number, WordDiffSegment[]>();

  // Find replacement pairs in this hunk
  const { pairs } = findReplacePairs(hunk.lines);

  // For each pair, compute word diff and store by absolute line index
  // We need to map the pair's relative indices back to the oldLines/newLines arrays

  // Track how many - and + lines we've seen to compute absolute indices
  let oldOffset = 0;
  let newOffset = 0;
  let currentRemovals: Array<{ absIdx: number; text: string }> = [];
  let currentAdditions: Array<{ absIdx: number; text: string }> = [];

  const flushPairs = () => {
    const pairCount = Math.min(currentRemovals.length, currentAdditions.length);
    for (let i = 0; i < pairCount; i++) {
      const removal = currentRemovals[i];
      const addition = currentAdditions[i];
      if (removal && addition) {
        const wordDiff = computeWordDiff(removal.text, addition.text);
        // Only add if there are actual changes (not all unchanged)
        const hasChanges = wordDiff.some(
          (seg) => seg.type === "removed" || seg.type === "added",
        );
        if (hasChanges) {
          oldLineDiffs.set(removal.absIdx, wordDiff);
          newLineDiffs.set(addition.absIdx, wordDiff);
        }
      }
    }
    currentRemovals = [];
    currentAdditions = [];
  };

  for (const line of hunk.lines) {
    const prefix = line[0];
    const text = line.slice(1);

    if (prefix === "-") {
      // If we were collecting additions, flush first
      if (currentAdditions.length > 0) {
        flushPairs();
      }
      currentRemovals.push({
        absIdx: hunkOldStartIdx + oldOffset,
        text,
      });
      oldOffset++;
    } else if (prefix === "+") {
      currentAdditions.push({
        absIdx: hunkNewStartIdx + newOffset,
        text,
      });
      newOffset++;
    } else if (prefix === " ") {
      flushPairs();
      oldOffset++;
      newOffset++;
    } else if (line.startsWith("@@")) {
      flushPairs();
    }
  }

  // Flush any remaining pairs
  flushPairs();

  return { oldLineDiffs, newLineDiffs };
}

/**
 * Build syntax-highlighted diff HTML by highlighting old_string and new_string
 * separately with the file's language, then reconstructing the diff.
 *
 * @returns Highlighted HTML or null if language is unknown/unsupported
 */
async function highlightDiffWithSyntax(
  oldString: string,
  newString: string,
  hunks: PatchHunk[],
  filePath: string,
): Promise<string | null> {
  // Detect language from file extension
  const lang = getLanguageForPath(filePath);
  if (!lang) return null;

  // Highlight both strings with the file's language
  // Handle empty strings - highlightCode returns null for empty input
  const oldResult =
    oldString.length > 0 ? await highlightCode(oldString, lang) : null;
  const newResult =
    newString.length > 0 ? await highlightCode(newString, lang) : null;

  // If both fail (not just empty), fall back
  if (!oldResult && oldString.length > 0) return null;
  if (!newResult && newString.length > 0) return null;

  // Extract lines from Shiki HTML
  const oldLines = oldResult ? extractShikiLines(oldResult.html) : [];
  const newLines = newResult ? extractShikiLines(newResult.html) : [];

  // Pre-compute word diffs for all hunks
  const allOldLineDiffs = new Map<number, WordDiffSegment[]>();
  const allNewLineDiffs = new Map<number, WordDiffSegment[]>();

  for (const hunk of hunks) {
    const hunkOldStartIdx = hunk.oldStart - 1; // Convert to 0-indexed
    const hunkNewStartIdx = hunk.newStart - 1;
    const { oldLineDiffs, newLineDiffs } = computeHunkWordDiffs(
      hunk,
      hunkOldStartIdx,
      hunkNewStartIdx,
    );

    // Merge into global maps
    for (const [idx, diff] of oldLineDiffs) {
      allOldLineDiffs.set(idx, diff);
    }
    for (const [idx, diff] of newLineDiffs) {
      allNewLineDiffs.set(idx, diff);
    }
  }

  // Build diff HTML by mapping hunk lines to highlighted source lines
  const resultLines: string[] = [];

  for (const hunk of hunks) {
    // Add hunk header (hidden by CSS but needed for tests)
    resultLines.push(
      `<span class="line line-hunk">@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@</span>`,
    );

    let oldIdx = hunk.oldStart - 1; // 0-indexed
    let newIdx = hunk.newStart - 1;

    for (const line of hunk.lines) {
      const prefix = line[0];
      let lineClass: string;
      let content: string;

      if (prefix === " ") {
        // Context line - use old (identical in both)
        lineClass = "line line-context";
        content = oldLines[oldIdx++] ?? "";
        newIdx++;
      } else if (prefix === "-") {
        // Deleted line - use old
        lineClass = "line line-deleted";
        content = oldLines[oldIdx] ?? "";
        // Apply word diff if available
        const wordDiff = allOldLineDiffs.get(oldIdx);
        if (wordDiff) {
          content = injectWordDiffMarkers(content, wordDiff, "old");
        }
        oldIdx++;
      } else if (prefix === "+") {
        // Inserted line - use new
        lineClass = "line line-inserted";
        content = newLines[newIdx] ?? "";
        // Apply word diff if available
        const wordDiff = allNewLineDiffs.get(newIdx);
        if (wordDiff) {
          content = injectWordDiffMarkers(content, wordDiff, "new");
        }
        newIdx++;
      } else {
        continue; // Skip unexpected
      }

      resultLines.push(
        `<span class="${lineClass}"><span class="diff-prefix">${escapeHtml(prefix)}</span>${content}</span>`,
      );
    }
  }

  return `<pre class="shiki"><code class="language-${lang}">${resultLines.join("\n")}</code></pre>`;
}

/**
 * Compute an edit augment for an Edit tool_use.
 *
 * @param toolUseId - The tool_use ID to associate with this augment
 * @param input - The Edit tool input containing file_path, old_string, new_string
 * @returns EditAugment with structuredPatch and highlighted diff HTML
 */
export async function computeEditAugment(
  toolUseId: string,
  input: EditInput,
): Promise<EditAugment> {
  const { file_path, old_string, new_string } = input;

  // Compute structured patch using jsdiff
  const patch = structuredPatch(
    file_path,
    file_path,
    old_string,
    new_string,
    "", // oldHeader
    "", // newHeader
    { context: CONTEXT_LINES },
  );

  // Convert hunks to our format
  const structuredPatchResult = convertHunks(patch.hunks);

  // Try syntax-highlighted diff first (highlights code with file's language)
  let diffHtml = await highlightDiffWithSyntax(
    old_string,
    new_string,
    structuredPatchResult,
    file_path,
  );

  // Fall back to diff-only highlighting if syntax highlighting fails
  if (!diffHtml) {
    const diffText = patchToUnifiedText(structuredPatchResult);
    const highlightResult = await highlightCode(diffText, "diff");
    if (highlightResult) {
      // Post-process to add line type classes for background colors
      diffHtml = addDiffLineClasses(highlightResult.html);
    } else {
      // Fallback to plain text wrapped in pre/code
      diffHtml = `<pre class="shiki"><code class="language-diff">${escapeHtml(diffText)}</code></pre>`;
    }
  }

  return {
    toolUseId,
    type: "edit",
    structuredPatch: structuredPatchResult,
    diffHtml,
    filePath: file_path,
  };
}

/**
 * Add diff line type classes to shiki HTML output.
 * Detects line content and adds classes like "line-deleted", "line-inserted", "line-context", "line-hunk".
 * This enables CSS background colors for traditional diff styling.
 */
function addDiffLineClasses(html: string): string {
  // Match each <span class="line">...</span> and inspect content
  return html.replace(
    /<span class="line">([\s\S]*?)<\/span>/g,
    (_match, content: string) => {
      // Decode HTML entities to check the actual first character
      const decoded = content
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

      // Get the visible text (strip HTML tags)
      const textContent = decoded.replace(/<[^>]*>/g, "");
      const firstChar = textContent[0];

      let lineClass = "line";
      if (firstChar === "-") {
        lineClass = "line line-deleted";
      } else if (firstChar === "+") {
        lineClass = "line line-inserted";
      } else if (firstChar === "@") {
        lineClass = "line line-hunk";
      } else if (firstChar === " ") {
        lineClass = "line line-context";
      }

      return `<span class="${lineClass}">${content}</span>`;
    },
  );
}

/**
 * Escape HTML special characters for fallback rendering.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Represents a paired line in a replacement hunk (a line that was modified).
 */
interface LinePair {
  oldLineIndex: number; // Index into the removed lines array (0-based within the group)
  newLineIndex: number; // Index into the added lines array (0-based within the group)
  oldText: string; // The text content (without the - prefix)
  newText: string; // The text content (without the + prefix)
}

/**
 * Result of analyzing a hunk for replacement pairs.
 */
interface HunkReplacePairs {
  pairs: LinePair[];
  // Lines that don't have a pair (pure additions/deletions)
  unpairedRemovals: Array<{ index: number; text: string }>;
  unpairedAdditions: Array<{ index: number; text: string }>;
}

/**
 * Find consecutive -/+ line pairs in diff hunk lines that represent "replacements".
 * These pairs are candidates for word-level diffing.
 *
 * Pairing strategy:
 * - Match removed lines with added lines in order (first - with first +, etc.)
 * - If there are more - than +, extra removed lines have no pair
 * - If there are more + than -, extra added lines have no pair
 * - Context lines (space prefix) or hunk headers (@@) reset the grouping
 *
 * @param hunkLines - Array of diff lines with prefixes: ' ', '-', '+', or starting with '@@'
 * @returns Object containing pairs and unpaired lines
 */
function findReplacePairs(hunkLines: string[]): HunkReplacePairs {
  const result: HunkReplacePairs = {
    pairs: [],
    unpairedRemovals: [],
    unpairedAdditions: [],
  };

  // Collect removals and additions in the current contiguous group
  let currentRemovals: Array<{ index: number; text: string }> = [];
  let currentAdditions: Array<{ index: number; text: string }> = [];

  /**
   * Process the current group of removals and additions, creating pairs
   * and tracking unpaired lines.
   */
  function flushGroup() {
    // Pair up removals and additions in order
    const pairCount = Math.min(currentRemovals.length, currentAdditions.length);

    for (let i = 0; i < pairCount; i++) {
      const removal = currentRemovals[i];
      const addition = currentAdditions[i];
      if (removal && addition) {
        result.pairs.push({
          oldLineIndex: i,
          newLineIndex: i,
          oldText: removal.text,
          newText: addition.text,
        });
      }
    }

    // Track unpaired removals (when more - than +)
    for (let i = pairCount; i < currentRemovals.length; i++) {
      const removal = currentRemovals[i];
      if (removal) {
        result.unpairedRemovals.push(removal);
      }
    }

    // Track unpaired additions (when more + than -)
    for (let i = pairCount; i < currentAdditions.length; i++) {
      const addition = currentAdditions[i];
      if (addition) {
        result.unpairedAdditions.push(addition);
      }
    }

    // Reset for next group
    currentRemovals = [];
    currentAdditions = [];
  }

  for (const line of hunkLines) {
    const prefix = line[0];

    if (prefix === "-") {
      // If we were collecting additions, flush the group first
      // (additions after removals is normal, but - after + means new group)
      if (currentAdditions.length > 0) {
        flushGroup();
      }
      currentRemovals.push({
        index: currentRemovals.length,
        text: line.slice(1),
      });
    } else if (prefix === "+") {
      // Additions are added to current group
      currentAdditions.push({
        index: currentAdditions.length,
        text: line.slice(1),
      });
    } else if (prefix === " " || line.startsWith("@@")) {
      // Context line or hunk header - flush current group and reset
      flushGroup();
    }
    // Skip other lines (like "\ No newline at end of file")
  }

  // Flush any remaining group
  flushGroup();

  return result;
}

/**
 * Represents a segment of a word-level diff.
 */
export interface WordDiffSegment {
  text: string;
  type: "unchanged" | "removed" | "added";
}

/**
 * Compute word-level diff between two strings.
 * Uses jsdiff's diffWordsWithSpace to find word-by-word changes.
 * Unlike diffWords, this treats whitespace as significant, so leading
 * indentation is preserved as unchanged when only words change.
 *
 * @param oldLine - The original string
 * @param newLine - The modified string
 * @returns Array of diff segments with their types
 */
function computeWordDiff(oldLine: string, newLine: string): WordDiffSegment[] {
  const changes = diffWordsWithSpace(oldLine, newLine);

  return changes.map((change) => ({
    text: change.value,
    type: change.added ? "added" : change.removed ? "removed" : "unchanged",
  }));
}

/**
 * Maps HTML entity names to their decoded characters.
 */
const HTML_ENTITY_MAP: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#039;": "'",
  "&apos;": "'",
};

/**
 * Represents a segment of HTML that is either text content or a tag.
 */
interface HtmlSegment {
  type: "text" | "tag";
  content: string;
  // For text segments, the decoded plain text
  plainText?: string;
}

/**
 * Parse HTML into segments of text content and tags.
 * Text content has HTML entities decoded for matching against plain text.
 */
function parseHtmlSegments(html: string): HtmlSegment[] {
  const segments: HtmlSegment[] = [];
  const tagRegex = /<[^>]*>/g;
  let lastIndex = 0;

  for (const match of html.matchAll(tagRegex)) {
    // Add text content before this tag
    if (match.index > lastIndex) {
      const content = html.slice(lastIndex, match.index);
      segments.push({
        type: "text",
        content,
        plainText: decodeHtmlEntities(content),
      });
    }

    // Add the tag itself
    segments.push({
      type: "tag",
      content: match[0],
    });

    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text after the last tag
  if (lastIndex < html.length) {
    const content = html.slice(lastIndex);
    segments.push({
      type: "text",
      content,
      plainText: decodeHtmlEntities(content),
    });
  }

  return segments;
}

/**
 * Decode HTML entities in a string to their plain text equivalents.
 * Handles named entities (&lt;), decimal entities (&#60;), and hex entities (&#x3C;).
 */
function decodeHtmlEntities(html: string): string {
  return html.replace(/&[^;]+;/g, (entity) => {
    // Check named entity map first
    if (HTML_ENTITY_MAP[entity]) {
      return HTML_ENTITY_MAP[entity];
    }

    // Handle numeric entities: &#60; (decimal) or &#x3C; (hex)
    if (entity.startsWith("&#")) {
      const isHex = entity[2] === "x" || entity[2] === "X";
      const numStr = isHex ? entity.slice(3, -1) : entity.slice(2, -1);
      const codePoint = Number.parseInt(numStr, isHex ? 16 : 10);
      if (!Number.isNaN(codePoint)) {
        return String.fromCodePoint(codePoint);
      }
    }

    return entity;
  });
}

/**
 * Inject word-level diff markers into syntax-highlighted HTML.
 *
 * This function takes syntax-highlighted HTML (from Shiki) and a word diff,
 * then wraps changed portions in <span class="diff-word-removed"> or
 * <span class="diff-word-added"> tags without breaking the HTML structure.
 *
 * @param html - Syntax-highlighted HTML for a single line (inner content of <span class="line">)
 * @param wordDiff - Word diff segments from computeWordDiff()
 * @param mode - Whether this is the 'old' (removed) or 'new' (added) line
 * @returns HTML with word diff markers injected
 */
function injectWordDiffMarkers(
  html: string,
  wordDiff: WordDiffSegment[],
  mode: "old" | "new",
): string {
  // Determine which segment type to highlight based on mode
  const targetType = mode === "old" ? "removed" : "added";
  const cssClass = mode === "old" ? "diff-word-removed" : "diff-word-added";

  // Build the plain text that should appear in this version
  // In 'old' mode: unchanged + removed
  // In 'new' mode: unchanged + added
  const relevantSegments = wordDiff.filter(
    (seg) => seg.type === "unchanged" || seg.type === targetType,
  );

  // Parse HTML into text and tag segments
  const htmlSegments = parseHtmlSegments(html);

  // Build result by walking through word diff segments and HTML segments together
  const result: string[] = [];
  let htmlSegmentIndex = 0;
  let htmlTextOffset = 0; // Offset within current text segment's plainText

  for (const segment of relevantSegments) {
    const segmentText = segment.text;
    let remaining = segmentText.length;
    const needsHighlight = segment.type === targetType;

    // Track if we're in the middle of a highlight span
    let highlightParts: string[] = [];

    while (remaining > 0) {
      const htmlSeg = htmlSegments[htmlSegmentIndex];
      if (!htmlSeg) break;

      if (htmlSeg.type === "tag") {
        // Tags pass through unchanged
        // If we're collecting highlight parts, we need to close/reopen the highlight
        if (needsHighlight && highlightParts.length > 0) {
          // Flush accumulated highlight parts before the tag
          result.push(
            `<span class="${cssClass}">${highlightParts.join("")}</span>`,
          );
          highlightParts = [];
        }
        result.push(htmlSeg.content);
        htmlSegmentIndex++;
        continue;
      }

      // Text segment
      const plainText = htmlSeg.plainText ?? "";
      const availableText = plainText.slice(htmlTextOffset);
      const availableLen = availableText.length;

      if (availableLen === 0) {
        // Move to next segment
        htmlSegmentIndex++;
        htmlTextOffset = 0;
        continue;
      }

      // How much of this text segment do we need?
      const takeLen = Math.min(remaining, availableLen);
      const takenPlainText = availableText.slice(0, takeLen);

      // Convert taken plain text back to HTML (re-encode entities)
      const takenHtml = convertPlainTextToHtml(
        htmlSeg.content,
        htmlTextOffset,
        takenPlainText,
      );

      if (needsHighlight) {
        highlightParts.push(takenHtml);
      } else {
        result.push(takenHtml);
      }

      remaining -= takeLen;
      htmlTextOffset += takeLen;

      // If we've consumed this segment, move to next
      if (htmlTextOffset >= plainText.length) {
        htmlSegmentIndex++;
        htmlTextOffset = 0;
      }
    }

    // Flush any remaining highlight parts
    if (needsHighlight && highlightParts.length > 0) {
      result.push(
        `<span class="${cssClass}">${highlightParts.join("")}</span>`,
      );
    }
  }

  // Append any remaining HTML segments (tags after all text is consumed)
  for (let i = htmlSegmentIndex; i < htmlSegments.length; i++) {
    const htmlSeg = htmlSegments[i];
    if (!htmlSeg) continue;

    if (htmlSeg.type === "tag") {
      result.push(htmlSeg.content);
    } else if (i === htmlSegmentIndex && htmlTextOffset > 0) {
      // First remaining segment may have a partial offset
      const remainingText = (htmlSeg.plainText ?? "").slice(htmlTextOffset);
      if (remainingText.length > 0) {
        result.push(
          htmlSeg.content.slice(
            findHtmlOffsetForPlainTextOffset(htmlSeg.content, htmlTextOffset),
          ),
        );
      }
    } else {
      // Full text segment
      result.push(htmlSeg.content);
    }
  }

  return result.join("");
}

/**
 * Convert a portion of plain text back to its HTML representation,
 * using the original HTML as a reference for entity encoding.
 *
 * @param originalHtml - The original HTML text segment (with entities)
 * @param startPlainOffset - Starting offset in the decoded plain text
 * @param plainText - The plain text portion we want to convert
 * @returns The HTML representation of the plain text
 */
function convertPlainTextToHtml(
  originalHtml: string,
  startPlainOffset: number,
  plainText: string,
): string {
  // Find the starting position in the original HTML
  const htmlStart = findHtmlOffsetForPlainTextOffset(
    originalHtml,
    startPlainOffset,
  );

  // Find the ending position
  const htmlEnd = findHtmlOffsetForPlainTextOffset(
    originalHtml,
    startPlainOffset + plainText.length,
  );

  return originalHtml.slice(htmlStart, htmlEnd);
}

/**
 * Check if an HTML entity decodes to a single character.
 * Handles named entities, decimal entities (&#60;), and hex entities (&#x3C;).
 */
function isValidHtmlEntity(entity: string): boolean {
  if (HTML_ENTITY_MAP[entity]) {
    return true;
  }

  // Check numeric entities: &#60; or &#x3C;
  if (entity.startsWith("&#")) {
    const isHex = entity[2] === "x" || entity[2] === "X";
    const numStr = isHex ? entity.slice(3, -1) : entity.slice(2, -1);
    const codePoint = Number.parseInt(numStr, isHex ? 16 : 10);
    return !Number.isNaN(codePoint);
  }

  return false;
}

/**
 * Find the position in HTML string that corresponds to a position in decoded plain text.
 *
 * @param html - HTML string (may contain entities)
 * @param plainOffset - Offset in the decoded plain text
 * @returns Offset in the HTML string
 */
function findHtmlOffsetForPlainTextOffset(
  html: string,
  plainOffset: number,
): number {
  let htmlPos = 0;
  let plainPos = 0;

  while (plainPos < plainOffset && htmlPos < html.length) {
    // Check for HTML entity
    if (html[htmlPos] === "&") {
      // Find the end of the entity
      const semiPos = html.indexOf(";", htmlPos);
      if (semiPos !== -1) {
        const entity = html.slice(htmlPos, semiPos + 1);
        if (isValidHtmlEntity(entity)) {
          // This entity decodes to one character
          htmlPos = semiPos + 1;
          plainPos++;
          continue;
        }
      }
    }

    // Regular character
    htmlPos++;
    plainPos++;
  }

  return htmlPos;
}

/**
 * @internal
 * Exported for testing purposes only. Do not use in production code.
 */
export const __test__ = {
  extractShikiLines,
  addDiffLineClasses,
  convertHunks,
  patchToUnifiedText,
  escapeHtml,
  computeWordDiff,
  findReplacePairs,
  injectWordDiffMarkers,
};
