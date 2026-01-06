/**
 * Read augment service - computes syntax-highlighted HTML for Read tool_result blocks.
 *
 * This enables syntax highlighting for file content displayed in the Read tool,
 * including partial file reads (line ranges).
 *
 * For markdown files, we also render the content to HTML for preview display.
 *
 * Note: For partial reads, we highlight just the visible content. This works
 * correctly in most cases, but may produce incorrect highlighting if the range
 * starts mid-context (e.g., inside a multi-line comment or string).
 */

import { marked } from "marked";
import { highlightFile } from "../highlighting/index.js";

/**
 * Input for computing a read augment.
 */
export interface ReadAugmentInput {
  file_path: string;
  content: string;
}

/**
 * Result from computing a read augment.
 */
export interface ReadAugmentResult {
  /** Syntax-highlighted HTML */
  highlightedHtml: string;
  /** Language used for highlighting */
  language: string;
  /** Whether content was truncated for highlighting */
  truncated: boolean;
  /** Rendered markdown HTML (only for .md files) */
  renderedMarkdownHtml?: string;
}

/** File extensions that should get rendered markdown preview */
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdx"]);

/**
 * Check if a file path is a markdown file.
 */
function isMarkdownFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return MARKDOWN_EXTENSIONS.has(ext);
}

/**
 * Render markdown content to HTML using marked.
 */
async function renderMarkdown(content: string): Promise<string> {
  // Strip line numbers from content (format: "   123\t" prefix)
  const contentWithoutLineNumbers = content
    .split("\n")
    .map((line) => {
      // Match line number prefix: spaces, digits, tab
      const match = line.match(/^\s*\d+\t(.*)$/);
      return match ? match[1] : line;
    })
    .join("\n");

  return marked.parse(contentWithoutLineNumbers, { async: true });
}

/**
 * Compute a read augment for a Read tool_result.
 *
 * @param input - The file path and content to highlight
 * @returns ReadAugmentResult with highlighted HTML, or null if language is unsupported
 */
export async function computeReadAugment(
  input: ReadAugmentInput,
): Promise<ReadAugmentResult | null> {
  const { file_path, content } = input;

  // Use highlightFile which detects language from file extension
  const result = await highlightFile(content, file_path);
  if (!result) {
    return null;
  }

  // For markdown files, also render the content to HTML
  let renderedMarkdownHtml: string | undefined;
  if (isMarkdownFile(file_path)) {
    renderedMarkdownHtml = await renderMarkdown(content);
  }

  return {
    highlightedHtml: result.html,
    language: result.language,
    truncated: result.truncated,
    renderedMarkdownHtml,
  };
}
