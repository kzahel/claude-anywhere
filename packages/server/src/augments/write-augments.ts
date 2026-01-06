/**
 * Write augment service - computes syntax-highlighted HTML for Write tool_use blocks.
 *
 * This enables consistent code highlighting for written file content,
 * matching the FileViewer's highlighting behavior.
 */

import { highlightFile } from "../highlighting/index.js";

/**
 * Input for computing a write augment.
 */
export interface WriteInput {
  file_path: string;
  content: string;
}

/**
 * Result from computing a write augment.
 */
export interface WriteAugmentResult {
  /** Syntax-highlighted HTML */
  highlightedHtml: string;
  /** Language used for highlighting */
  language: string;
  /** Whether content was truncated for highlighting */
  truncated: boolean;
}

/**
 * Compute a write augment for a Write tool_use.
 *
 * @param input - The Write tool input containing file_path and content
 * @returns WriteAugmentResult with highlighted HTML, or null if language is unsupported
 */
export async function computeWriteAugment(
  input: WriteInput,
): Promise<WriteAugmentResult | null> {
  const { file_path, content } = input;

  // Use highlightFile which detects language from file extension
  const result = await highlightFile(content, file_path);
  if (!result) {
    return null;
  }

  return {
    highlightedHtml: result.html,
    language: result.language,
    truncated: result.truncated,
  };
}
