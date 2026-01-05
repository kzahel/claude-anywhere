import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type StreamCoordinator,
  createStreamCoordinator,
} from "../../src/augments/stream-coordinator.js";

describe("StreamCoordinator", () => {
  let coordinator: StreamCoordinator;

  beforeAll(async () => {
    coordinator = await createStreamCoordinator({
      languages: ["javascript", "typescript", "python"],
      theme: "github-dark",
    });
  });

  beforeEach(() => {
    coordinator.reset();
  });

  describe("single chunk with complete block", () => {
    it("generates augment for complete paragraph", async () => {
      const result = await coordinator.onChunk("Hello world\n\n");

      expect(result.raw).toBe("Hello world\n\n");
      expect(result.augments).toHaveLength(1);
      expect(result.augments[0]?.type).toBe("paragraph");
      expect(result.augments[0]?.blockIndex).toBe(0);
      expect(result.augments[0]?.html).toContain("Hello world");
      expect(result.pendingHtml).toBe("");
    });

    it("generates augment for complete heading", async () => {
      const result = await coordinator.onChunk("# My Heading\n");

      expect(result.augments).toHaveLength(1);
      expect(result.augments[0]?.type).toBe("heading");
      expect(result.augments[0]?.html).toContain("<h1>");
      expect(result.augments[0]?.html).toContain("My Heading");
    });

    it("generates augment for complete code block", async () => {
      const result = await coordinator.onChunk(
        "```javascript\nconst x = 1;\n```\n",
      );

      expect(result.augments).toHaveLength(1);
      expect(result.augments[0]?.type).toBe("code");
      expect(result.augments[0]?.html).toContain("<pre");
      expect(result.augments[0]?.html).toContain("shiki");
    });
  });

  describe("multiple chunks forming one block", () => {
    it("augment only emitted on completion", async () => {
      // First chunk - partial paragraph
      const result1 = await coordinator.onChunk("Hello ");
      expect(result1.augments).toHaveLength(0);
      expect(result1.pendingHtml).toBe("Hello ");

      // Second chunk - still incomplete
      const result2 = await coordinator.onChunk("world");
      expect(result2.augments).toHaveLength(0);
      expect(result2.pendingHtml).toBe("Hello world");

      // Third chunk - double newline completes paragraph
      const result3 = await coordinator.onChunk("\n\n");
      expect(result3.augments).toHaveLength(1);
      expect(result3.augments[0]?.type).toBe("paragraph");
      expect(result3.augments[0]?.html).toContain("Hello world");
      expect(result3.pendingHtml).toBe("");
    });

    it("code block emits streaming augments before closing fence", async () => {
      const result1 = await coordinator.onChunk("```javascript\n");
      expect(result1.augments).toHaveLength(1);
      expect(result1.augments[0]?.type).toBe("code");
      expect(result1.augments[0]?.blockIndex).toBe(0);
      expect(result1.pendingHtml).toBe(""); // No pending when streaming code block

      const result2 = await coordinator.onChunk("const x = 1;\n");
      expect(result2.augments).toHaveLength(1);
      expect(result2.augments[0]?.type).toBe("code");
      expect(result2.augments[0]?.blockIndex).toBe(0); // Same block index
      expect(result2.augments[0]?.html).toContain("const");

      const result3 = await coordinator.onChunk("```\n");
      expect(result3.augments).toHaveLength(1);
      expect(result3.augments[0]?.type).toBe("code");
      expect(result3.augments[0]?.blockIndex).toBe(0); // Still same block index
    });
  });

  describe("multiple blocks in one chunk", () => {
    it("generates multiple augments", async () => {
      const result = await coordinator.onChunk(
        "# Heading\n\nParagraph text\n\n",
      );

      expect(result.augments).toHaveLength(2);
      expect(result.augments[0]?.type).toBe("heading");
      expect(result.augments[0]?.blockIndex).toBe(0);
      expect(result.augments[1]?.type).toBe("paragraph");
      expect(result.augments[1]?.blockIndex).toBe(1);
    });

    it("handles heading followed by code block", async () => {
      const result = await coordinator.onChunk(
        "# Code Example\n```javascript\nconst x = 1;\n```\n",
      );

      expect(result.augments).toHaveLength(2);
      expect(result.augments[0]?.type).toBe("heading");
      expect(result.augments[1]?.type).toBe("code");
    });
  });

  describe("pending text rendered with inline formatting", () => {
    it("renders bold in pending text", async () => {
      const result = await coordinator.onChunk("This is **bold** text");

      expect(result.pendingHtml).toBe("This is <strong>bold</strong> text");
    });

    it("renders italic in pending text", async () => {
      const result = await coordinator.onChunk("This is *italic* text");

      expect(result.pendingHtml).toBe("This is <em>italic</em> text");
    });

    it("renders inline code in pending text", async () => {
      const result = await coordinator.onChunk("Use `console.log()`");

      expect(result.pendingHtml).toBe("Use <code>console.log()</code>");
    });

    it("renders links in pending text", async () => {
      const result = await coordinator.onChunk(
        "Check [docs](https://example.com)",
      );

      expect(result.pendingHtml).toBe(
        'Check <a href="https://example.com">docs</a>',
      );
    });

    it("escapes HTML in pending text", async () => {
      const result = await coordinator.onChunk("<script>alert('xss')</script>");

      expect(result.pendingHtml).toContain("&lt;script&gt;");
      expect(result.pendingHtml).not.toContain("<script>");
    });
  });

  describe("flush", () => {
    it("returns final incomplete block as augment", async () => {
      await coordinator.onChunk("Incomplete paragraph");
      const flushResult = await coordinator.flush();

      expect(flushResult.augments).toHaveLength(1);
      expect(flushResult.augments[0]?.type).toBe("paragraph");
      expect(flushResult.augments[0]?.html).toContain("Incomplete paragraph");
      expect(flushResult.pendingHtml).toBe("");
    });

    it("returns final incomplete code block", async () => {
      await coordinator.onChunk("```javascript\nconst x = 1;");
      const flushResult = await coordinator.flush();

      expect(flushResult.augments).toHaveLength(1);
      expect(flushResult.augments[0]?.type).toBe("code");
    });

    it("returns empty augments if no pending content", async () => {
      await coordinator.onChunk("Complete paragraph\n\n");
      const flushResult = await coordinator.flush();

      expect(flushResult.augments).toHaveLength(0);
      expect(flushResult.pendingHtml).toBe("");
    });

    it("maintains block index across chunks and flush", async () => {
      await coordinator.onChunk("# First\n");
      await coordinator.onChunk("# Second\n");
      await coordinator.onChunk("Incomplete");

      const flushResult = await coordinator.flush();

      expect(flushResult.augments).toHaveLength(1);
      expect(flushResult.augments[0]?.blockIndex).toBe(2);
    });
  });

  describe("reset", () => {
    it("clears all state", async () => {
      // Build up some state
      await coordinator.onChunk("# Heading\n");
      await coordinator.onChunk("Partial");

      // Reset
      coordinator.reset();

      // Verify state is cleared by checking new content starts fresh
      const result = await coordinator.onChunk("# New Heading\n");
      expect(result.augments).toHaveLength(1);
      expect(result.augments[0]?.blockIndex).toBe(0); // Index reset to 0
    });

    it("resets block index counter", async () => {
      await coordinator.onChunk("# First\n");
      await coordinator.onChunk("# Second\n");

      coordinator.reset();

      const result = await coordinator.onChunk("# After Reset\n");
      expect(result.augments[0]?.blockIndex).toBe(0);
    });

    it("clears pending content", async () => {
      await coordinator.onChunk("Pending content");

      coordinator.reset();

      const result = await coordinator.onChunk("New content");
      expect(result.pendingHtml).toBe("New content");
    });
  });

  describe("integration: realistic Claude streaming", () => {
    it("handles many small chunks forming complete document", async () => {
      // Simulate Claude streaming character by character (more realistic: small chunks)
      const fullText =
        "# Hello World\n\nThis is a **test** paragraph.\n\n```javascript\nconst x = 1;\n```\n";
      // Use [\s\S] to match any char including newlines (. doesn't match newlines by default)
      const chunks = fullText.match(/[\s\S]{1,3}/g) ?? []; // Chunks of 3 chars

      const allAugments: Awaited<
        ReturnType<typeof coordinator.onChunk>
      >["augments"] = [];

      for (const chunk of chunks) {
        const result = await coordinator.onChunk(chunk);
        allAugments.push(...result.augments);
      }

      // Flush to get any remaining blocks
      const flushResult = await coordinator.flush();
      allAugments.push(...flushResult.augments);

      // Should have heading, paragraph, and code block
      expect(allAugments.length).toBeGreaterThanOrEqual(3);

      // Verify types and order
      expect(allAugments.find((a) => a.type === "heading")).toBeDefined();
      expect(allAugments.find((a) => a.type === "paragraph")).toBeDefined();
      expect(allAugments.find((a) => a.type === "code")).toBeDefined();
    });

    it("handles list items streaming in", async () => {
      const chunks = ["- item", " 1\n- item 2\n", "\n"];
      const allAugments: Awaited<
        ReturnType<typeof coordinator.onChunk>
      >["augments"] = [];

      for (const chunk of chunks) {
        const result = await coordinator.onChunk(chunk);
        allAugments.push(...result.augments);
      }

      expect(allAugments).toHaveLength(1);
      expect(allAugments[0]?.type).toBe("list");
      expect(allAugments[0]?.html).toContain("<li>");
    });

    it("handles blockquote streaming", async () => {
      const chunks = ["> This is ", "a quote\n", "\nNext para"];
      const allAugments: Awaited<
        ReturnType<typeof coordinator.onChunk>
      >["augments"] = [];

      for (const chunk of chunks) {
        const result = await coordinator.onChunk(chunk);
        allAugments.push(...result.augments);
      }

      expect(allAugments).toHaveLength(1);
      expect(allAugments[0]?.type).toBe("blockquote");
      expect(allAugments[0]?.html).toContain("<blockquote>");
    });

    it("preserves raw chunks exactly", async () => {
      const chunks = ["Hello ", "world"];
      const rawChunks: string[] = [];

      for (const chunk of chunks) {
        const result = await coordinator.onChunk(chunk);
        rawChunks.push(result.raw);
      }

      expect(rawChunks).toEqual(chunks);
    });

    it("handles interleaved code and text", async () => {
      const fullText =
        "Use `console.log()` for debugging.\n\n```typescript\nconst debug = true;\n```\n\nThat's all.\n\n";
      // Use [\s\S] to match any char including newlines
      const chunks = fullText.match(/[\s\S]{1,5}/g) ?? [];
      const allAugments: Awaited<
        ReturnType<typeof coordinator.onChunk>
      >["augments"] = [];

      for (const chunk of chunks) {
        const result = await coordinator.onChunk(chunk);
        allAugments.push(...result.augments);
      }

      // Flush to get any remaining blocks
      const flushResult = await coordinator.flush();
      allAugments.push(...flushResult.augments);

      // With streaming code blocks, we get multiple augments for the code block
      // as content streams in. Check for correct block types by unique block indices.
      const blocksByIndex = new Map<number, (typeof allAugments)[0]>();
      for (const aug of allAugments) {
        blocksByIndex.set(aug.blockIndex, aug);
      }

      expect(blocksByIndex.size).toBe(3); // 3 unique blocks
      expect(blocksByIndex.get(0)?.type).toBe("paragraph");
      expect(blocksByIndex.get(1)?.type).toBe("code");
      expect(blocksByIndex.get(2)?.type).toBe("paragraph");
    });
  });

  describe("default configuration", () => {
    it("creates coordinator with default config", async () => {
      const defaultCoordinator = await createStreamCoordinator();
      defaultCoordinator.reset();

      const result = await defaultCoordinator.onChunk(
        "```rust\nfn main() {}\n```\n",
      );

      // Should work with rust (one of the default languages)
      expect(result.augments).toHaveLength(1);
      expect(result.augments[0]?.type).toBe("code");
    });

    it("allows partial config override", async () => {
      const customCoordinator = await createStreamCoordinator({
        theme: "github-light",
      });
      customCoordinator.reset();

      const result = await customCoordinator.onChunk(
        "```javascript\nconst x = 1;\n```\n",
      );

      expect(result.augments).toHaveLength(1);
      expect(result.augments[0]?.html).toContain("<pre");
    });
  });

  describe("streaming code blocks (optimistic rendering)", () => {
    it("emits augment immediately when code fence opens", async () => {
      const result = await coordinator.onChunk("```typescript\n");

      expect(result.augments).toHaveLength(1);
      expect(result.augments[0]?.type).toBe("code");
      expect(result.augments[0]?.blockIndex).toBe(0);
      expect(result.augments[0]?.html).toContain("<pre");
    });

    it("has empty pendingHtml when streaming code block", async () => {
      const result = await coordinator.onChunk("```js\nconst x = 1;");

      expect(result.pendingHtml).toBe("");
      expect(result.augments).toHaveLength(1);
    });

    it("updates same blockIndex as code content streams in", async () => {
      await coordinator.onChunk("```python\n");
      const result2 = await coordinator.onChunk("def hello():\n");
      const result3 = await coordinator.onChunk("    print('hi')\n");

      expect(result2.augments[0]?.blockIndex).toBe(0);
      expect(result3.augments[0]?.blockIndex).toBe(0);

      // Content should accumulate
      expect(result3.augments[0]?.html).toContain("print");
    });

    it("increments blockIndex correctly after code block completes", async () => {
      // Streaming code block
      await coordinator.onChunk("```js\ncode\n```\n");

      // Next block should be index 1
      const result = await coordinator.onChunk("# Next Heading\n");
      expect(result.augments[0]?.blockIndex).toBe(1);
    });

    it("handles paragraph before streaming code block", async () => {
      const result1 = await coordinator.onChunk("Some text\n\n");
      expect(result1.augments).toHaveLength(1);
      expect(result1.augments[0]?.type).toBe("paragraph");
      expect(result1.augments[0]?.blockIndex).toBe(0);

      const result2 = await coordinator.onChunk("```typescript\nconst x = 1;");
      expect(result2.augments).toHaveLength(1);
      expect(result2.augments[0]?.type).toBe("code");
      expect(result2.augments[0]?.blockIndex).toBe(1);
    });

    it("renders code without language hint", async () => {
      const result = await coordinator.onChunk("```\nplain code");

      expect(result.augments).toHaveLength(1);
      expect(result.augments[0]?.type).toBe("code");
      expect(result.augments[0]?.html).toContain("plain code");
    });

    it("applies syntax highlighting to streaming code", async () => {
      const result = await coordinator.onChunk("```javascript\nconst x = 1;");

      expect(result.augments).toHaveLength(1);
      // Shiki should add spans for syntax highlighting
      expect(result.augments[0]?.html).toContain("shiki");
    });

    it("handles char-by-char streaming of code block", async () => {
      const codeBlock = "```typescript\nconst x: number = 1;\n```\n";
      const augmentsByChunk: number[] = [];

      for (const char of codeBlock) {
        const result = await coordinator.onChunk(char);
        augmentsByChunk.push(result.augments.length);
      }

      // Should have streaming augments while in code block, then final completion
      const totalAugments = augmentsByChunk.reduce((a, b) => a + b, 0);
      expect(totalAugments).toBeGreaterThan(1); // Multiple updates during streaming
    });

    it("transitions from streaming to completed correctly", async () => {
      // Start streaming code block
      const result1 = await coordinator.onChunk("```js\ncode");
      expect(result1.augments[0]?.blockIndex).toBe(0);

      // Complete the code block
      const result2 = await coordinator.onChunk("\n```\n");
      expect(result2.augments[0]?.blockIndex).toBe(0); // Same index

      // New block should get next index
      const result3 = await coordinator.onChunk("Next para\n\n");
      expect(result3.augments[0]?.blockIndex).toBe(1);
    });

    it("handles multiple code blocks with correct indices", async () => {
      // First code block (streaming then complete)
      await coordinator.onChunk("```js\ncode1\n```\n");

      // Second code block (streaming)
      const result = await coordinator.onChunk("```python\ncode2");
      expect(result.augments[0]?.blockIndex).toBe(1);

      // Complete second and add third
      await coordinator.onChunk("\n```\n");
      const result3 = await coordinator.onChunk("```rust\ncode3");
      expect(result3.augments[0]?.blockIndex).toBe(2);
    });
  });
});
