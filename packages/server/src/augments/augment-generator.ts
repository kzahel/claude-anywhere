/**
 * AugmentGenerator - Renders completed markdown blocks to HTML
 *
 * Uses shiki for syntax highlighting of code blocks and marked for
 * rendering other markdown blocks. Also provides lightweight inline
 * formatting for pending/incomplete text during streaming.
 */

import { transformFilePathsToHtml } from "@yep-anywhere/shared";
import { Marked, type MarkedExtension, type Tokens, marked } from "marked";
import {
  type BundledLanguage,
  type Highlighter,
  bundledLanguages,
  createHighlighter,
} from "shiki";
import type { CompletedBlock } from "./block-detector.js";

export interface Augment {
  blockIndex: number;
  html: string;
  type: CompletedBlock["type"];
}

export interface AugmentGeneratorConfig {
  languages: string[]; // Languages to pre-load for sync highlighting
  theme: string; // Shiki theme name, e.g. 'github-dark'
}

export interface AugmentGenerator {
  processBlock(block: CompletedBlock, blockIndex: number): Promise<Augment>;
  renderPending(pending: string): string; // Lightweight inline formatting for trailing text
}

/**
 * Creates an AugmentGenerator instance with pre-loaded syntax highlighting.
 *
 * @param config - Configuration for languages and theme
 * @returns Promise that resolves to an AugmentGenerator
 */
export async function createAugmentGenerator(
  config: AugmentGeneratorConfig,
): Promise<AugmentGenerator> {
  const theme = config.theme || "github-dark";

  // Filter languages to only include valid bundled languages
  const validLanguages = config.languages.filter(
    (lang) => lang in bundledLanguages,
  ) as BundledLanguage[];

  // Create highlighter with pre-loaded languages
  const highlighter = await createHighlighter({
    themes: [theme],
    langs:
      validLanguages.length > 0 ? validLanguages : ["javascript", "typescript"],
  });

  // Track loaded languages for sync checking
  const loadedLanguages = new Set<string>(validLanguages);

  return {
    async processBlock(
      block: CompletedBlock,
      blockIndex: number,
    ): Promise<Augment> {
      if (block.type === "code") {
        const html = await renderCodeBlock(
          block,
          highlighter,
          loadedLanguages,
          theme,
        );
        return { blockIndex, html, type: block.type };
      }

      const html = renderMarkdownBlock(block);
      return { blockIndex, html, type: block.type };
    },

    renderPending(pending: string): string {
      return renderInlineFormatting(pending);
    },
  };
}

/**
 * Extract code content from a code block, removing the fence markers.
 */
function extractCodeContent(content: string): string {
  const lines = content.split("\n");
  if (lines.length < 2) return "";

  // Remove first line (opening fence) and last line (closing fence if present)
  const firstLine = lines[0] ?? "";
  const hasClosingFence =
    lines.length > 1 &&
    /^(`{3,}|~{3,})$/.test((lines[lines.length - 1] ?? "").trim());

  const codeLines = hasClosingFence ? lines.slice(1, -1) : lines.slice(1);

  return codeLines.join("\n");
}

/**
 * Render a code block with syntax highlighting.
 */
async function renderCodeBlock(
  block: CompletedBlock,
  highlighter: Highlighter,
  loadedLanguages: Set<string>,
  theme: string,
): Promise<string> {
  const code = extractCodeContent(block.content);
  const lang = block.lang ?? "";

  // Check if language is loaded and valid
  const isValidLang = lang && lang in bundledLanguages;

  if (isValidLang && !loadedLanguages.has(lang)) {
    // Load the language dynamically
    try {
      await highlighter.loadLanguage(lang as BundledLanguage);
      loadedLanguages.add(lang);
    } catch {
      // Language loading failed, fall back to plain text
      return renderPlainCodeBlock(code, lang);
    }
  }

  if (isValidLang && loadedLanguages.has(lang)) {
    try {
      const html = highlighter.codeToHtml(code, {
        lang: lang as BundledLanguage,
        theme,
      });
      return html;
    } catch {
      // Highlighting failed, fall back to plain text
      return renderPlainCodeBlock(code, lang);
    }
  }

  // Unknown or empty language - render as plain code block
  return renderPlainCodeBlock(code, lang);
}

/**
 * Render a plain code block without syntax highlighting.
 */
function renderPlainCodeBlock(code: string, lang: string): string {
  const escapedCode = escapeHtml(code);
  const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
  return `<pre class="shiki"><code${langClass}>${escapedCode}</code></pre>`;
}

/**
 * Create a marked extension that transforms file paths into clickable links.
 * This is applied to text content in the rendered markdown.
 */
function createFilePathExtension(): MarkedExtension {
  return {
    renderer: {
      // Override text rendering to detect file paths
      text(token: Tokens.Text | Tokens.Escape): string {
        // Transform file paths in text content
        return transformFilePathsToHtml(token.text, escapeHtml);
      },
      // Override codespan (inline code) to detect file paths
      codespan(token: Tokens.Codespan): string {
        const code = token.text;
        // Check if the entire inline code is a file path
        // Only linkify if it contains a directory separator
        if (code.includes("/")) {
          const transformed = transformFilePathsToHtml(code, escapeHtml);
          // If transformation added a link, wrap in code tags
          if (transformed.includes("<a ")) {
            return `<code>${transformed}</code>`;
          }
        }
        return `<code>${escapeHtml(code)}</code>`;
      },
    },
  };
}

// Create a configured marked instance with file path extension
const markedWithFilePaths = new Marked(createFilePathExtension());

/**
 * Render a non-code markdown block using marked.
 */
function renderMarkdownBlock(block: CompletedBlock): string {
  // Use marked with file path extension to render the markdown
  const html = markedWithFilePaths.parse(block.content, {
    async: false,
  }) as string;
  return html.trim();
}

/**
 * Render lightweight inline formatting for pending/streaming text.
 * Handles: **bold**, *italic*, `code`, [text](url), file paths, and fenced code blocks.
 */
function renderInlineFormatting(text: string): string {
  // Check for fenced code block at the start (incomplete, no closing fence)
  const fenceMatch = text.match(/^(`{3,}|~{3,})(\w*)\n?([\s\S]*)$/);
  if (fenceMatch) {
    const [, fence, lang, code] = fenceMatch;
    // Check if the code block is already closed (has matching closing fence)
    const closingFencePattern = new RegExp(`^${fence}\\s*$`, "m");
    if (!closingFencePattern.test(code ?? "")) {
      // Incomplete code block - render as <pre><code>
      const escapedCode = escapeHtml(code ?? "");
      const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      return `<pre class="shiki pending-code"><code${langClass}>${escapedCode}</code></pre>`;
    }
  }

  // Regular inline formatting for non-code-block text
  // First, transform file paths to HTML (this also escapes the non-link parts)
  let result = transformFilePathsToHtml(text, escapeHtml);

  // Bold: **text** (use negative lookbehind to avoid matching inside file-link tags)
  result = result.replace(
    /(?<!<[^>]*)\*\*([^*]+)\*\*(?![^<]*>)/g,
    "<strong>$1</strong>",
  );

  // Italic: *text* (but not if it's actually bold marker)
  // Use negative lookbehind/lookahead to avoid matching inside bold or tags
  result = result.replace(
    /(?<!<[^>]*)(?<!\*)\*([^*]+)\*(?!\*)(?![^<]*>)/g,
    "<em>$1</em>",
  );

  // Inline code: `text`
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return result;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
