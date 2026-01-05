/**
 * Markdown augments - Render complete markdown text blocks to HTML
 *
 * This module provides functions to render full markdown text to HTML
 * with shiki syntax highlighting. Used when loading historical messages
 * to ensure identical rendering to the streaming path.
 */

import {
  type AugmentGenerator,
  type AugmentGeneratorConfig,
  createAugmentGenerator,
} from "./augment-generator.js";
import { BlockDetector } from "./block-detector.js";

export interface MarkdownAugment {
  /** Pre-rendered HTML with shiki syntax highlighting */
  html: string;
}

/**
 * Default configuration for the AugmentGenerator.
 * Should match the streaming coordinator config.
 */
const DEFAULT_CONFIG: AugmentGeneratorConfig = {
  languages: [
    "javascript",
    "js",
    "typescript",
    "ts",
    "tsx",
    "python",
    "bash",
    "json",
    "css",
    "html",
    "yaml",
    "sql",
    "go",
    "rust",
    "diff",
  ],
  theme: "github-dark",
};

// Singleton generator instance (initialized lazily)
let generatorPromise: Promise<AugmentGenerator> | null = null;

/**
 * Get or create the shared AugmentGenerator instance.
 * Uses a singleton to avoid re-loading shiki themes/languages.
 */
async function getGenerator(): Promise<AugmentGenerator> {
  if (!generatorPromise) {
    generatorPromise = createAugmentGenerator(DEFAULT_CONFIG);
  }
  return generatorPromise;
}

/**
 * Render markdown text to HTML with syntax highlighting.
 *
 * This uses the same BlockDetector and AugmentGenerator as the streaming
 * path, ensuring identical output for the same input.
 *
 * @param markdown - The markdown text to render
 * @returns The rendered HTML string
 */
export async function renderMarkdownToHtml(markdown: string): Promise<string> {
  if (!markdown.trim()) {
    return "";
  }

  const generator = await getGenerator();
  const detector = new BlockDetector();

  // Feed the entire markdown text at once
  const completedBlocks = detector.feed(markdown);

  // Flush any remaining content
  const finalBlocks = detector.flush();

  // Combine all blocks
  const allBlocks = [...completedBlocks, ...finalBlocks];

  // Render each block and concatenate HTML
  const htmlParts: string[] = [];
  for (let i = 0; i < allBlocks.length; i++) {
    const block = allBlocks[i];
    if (!block) continue;
    const augment = await generator.processBlock(block, i);
    htmlParts.push(augment.html);
  }

  return htmlParts.join("\n");
}

/**
 * Compute markdown augments for text content in messages.
 *
 * Extracts the first text block from assistant messages and renders to HTML.
 * Returns a map from message ID to augment.
 *
 * Note: Uses message ID as key (not messageId-blockIndex) because completed
 * messages have a single text block. The streaming path handles incremental
 * updates separately with chunk indices.
 *
 * @param messages - Array of messages from session
 * @param getMessageId - Function to get the ID of a message
 * @returns Map of message IDs to markdown augments
 */
export async function computeMarkdownAugments(
  messages: Array<{
    type?: string;
    message?: { content?: unknown };
    content?: unknown;
    uuid?: string;
    id?: string;
  }>,
  getMessageId: (msg: { uuid?: string; id?: string }) => string,
): Promise<Record<string, MarkdownAugment>> {
  const augments: Record<string, MarkdownAugment> = {};

  // Process all messages in parallel
  const messagePromises = messages.map(async (msg) => {
    // Only process assistant messages
    if (msg.type !== "assistant") return;

    const msgId = getMessageId(msg);

    // Get content from nested message object (SDK structure) or top-level
    const content = msg.message?.content ?? msg.content;
    if (!Array.isArray(content)) return;

    // Find the first text block (completed messages have one text block)
    const textBlock = content.find(
      (b): b is { type: "text"; text: string } =>
        b?.type === "text" && typeof b.text === "string" && b.text.trim() !== "",
    );

    if (!textBlock) return;

    try {
      const html = await renderMarkdownToHtml(textBlock.text);
      augments[msgId] = { html };
    } catch {
      // Skip messages that fail to render
    }
  });

  await Promise.all(messagePromises);
  return augments;
}
