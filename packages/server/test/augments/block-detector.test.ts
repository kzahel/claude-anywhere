import { describe, expect, it } from "vitest";
import {
  BlockDetector,
  type CompletedBlock,
  type StreamingCodeBlock,
} from "../../src/augments/block-detector.js";

describe("BlockDetector", () => {
  describe("basic block detection", () => {
    it("detects a paragraph ending with double newline", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("Hello world\n\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "paragraph",
        content: "Hello world",
      });
    });

    it("detects a heading ending with single newline", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("# Hello World\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "heading",
        content: "# Hello World",
      });
    });

    it("detects headings of different levels", () => {
      const detector = new BlockDetector();

      const h1 = detector.feed("# H1\n");
      expect(h1[0]).toMatchObject({ type: "heading", content: "# H1" });

      const h2 = detector.feed("## H2\n");
      expect(h2[0]).toMatchObject({ type: "heading", content: "## H2" });

      const h6 = detector.feed("###### H6\n");
      expect(h6[0]).toMatchObject({ type: "heading", content: "###### H6" });
    });

    it("detects a code block", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("```typescript\nconst x = 1;\n```\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "code",
        lang: "typescript",
        content: "```typescript\nconst x = 1;\n```",
      });
    });

    it("detects a code block without language hint", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("```\nplain code\n```\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "code",
        content: "```\nplain code\n```",
      });
      expect(blocks[0]?.lang).toBeUndefined();
    });

    it("detects a bullet list ending with double newline", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("- item 1\n- item 2\n\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "list",
        content: "- item 1\n- item 2",
      });
    });

    it("detects a bullet list with asterisks", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("* item 1\n* item 2\n\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "list",
        content: "* item 1\n* item 2",
      });
    });

    it("detects a numbered list ending with double newline", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("1. first\n2. second\n\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "list",
        content: "1. first\n2. second",
      });
    });

    it("detects a blockquote ending with double newline", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("> quote line 1\n> quote line 2\n\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "blockquote",
        content: "> quote line 1\n> quote line 2",
      });
    });

    it("detects horizontal rule with dashes", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("---\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "hr",
        content: "---",
      });
    });

    it("detects horizontal rule with asterisks", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("***\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "hr",
        content: "***",
      });
    });

    it("detects horizontal rule with underscores", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("___\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "hr",
        content: "___",
      });
    });
  });

  describe("block transitions", () => {
    it("paragraph ends when heading starts", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("Some text\n# Heading\n");

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: "paragraph",
        content: "Some text",
      });
      expect(blocks[1]).toMatchObject({
        type: "heading",
        content: "# Heading",
      });
    });

    it("paragraph ends when code block starts", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("Some text\n```js\ncode\n```\n");

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: "paragraph",
        content: "Some text",
      });
      expect(blocks[1]).toMatchObject({
        type: "code",
        lang: "js",
      });
    });

    it("paragraph ends when list starts", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("Some text\n- item\n\n");

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: "paragraph",
        content: "Some text",
      });
      expect(blocks[1]).toMatchObject({
        type: "list",
      });
    });

    it("list ends when non-list block starts", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("- item 1\n- item 2\n# Heading\n");

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: "list",
        content: "- item 1\n- item 2",
      });
      expect(blocks[1]).toMatchObject({
        type: "heading",
        content: "# Heading",
      });
    });

    it("blockquote ends when non-blockquote line appears", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("> quote\nNot a quote\n\n");

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: "blockquote",
        content: "> quote",
      });
      expect(blocks[1]).toMatchObject({
        type: "paragraph",
        content: "Not a quote",
      });
    });
  });

  describe("pending state", () => {
    it("tracks pending content for incomplete paragraph", () => {
      const detector = new BlockDetector();
      detector.feed("Hello");

      expect(detector.pending).toBe("Hello");
    });

    it("tracks pending content for incomplete code block", () => {
      const detector = new BlockDetector();
      detector.feed("```js\nconst x = 1;");

      expect(detector.pending).toBe("```js\nconst x = 1;");
    });

    it("clears pending after block completion", () => {
      const detector = new BlockDetector();
      detector.feed("Hello\n\n");

      expect(detector.pending).toBe("");
    });
  });

  describe("flush", () => {
    it("flushes pending paragraph", () => {
      const detector = new BlockDetector();
      detector.feed("Hello world");
      const blocks = detector.flush();

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "paragraph",
        content: "Hello world",
      });
    });

    it("flushes unclosed code block", () => {
      const detector = new BlockDetector();
      detector.feed("```js\nconst x = 1;");
      const blocks = detector.flush();

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "code",
        lang: "js",
      });
    });

    it("flushes incomplete list", () => {
      const detector = new BlockDetector();
      detector.feed("- item 1\n- item 2");
      const blocks = detector.flush();

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "list",
        content: "- item 1\n- item 2",
      });
    });

    it("returns empty array when nothing pending", () => {
      const detector = new BlockDetector();
      const blocks = detector.flush();

      expect(blocks).toHaveLength(0);
    });

    it("returns empty array when only whitespace pending", () => {
      const detector = new BlockDetector();
      detector.feed("   \n  ");
      const blocks = detector.flush();

      expect(blocks).toHaveLength(0);
    });
  });

  describe("offset tracking", () => {
    it("tracks startOffset and endOffset for single block", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("Hello\n\n");

      expect(blocks[0]).toMatchObject({
        startOffset: 0,
        endOffset: 5,
      });
    });

    it("tracks offsets across multiple blocks", () => {
      const detector = new BlockDetector();
      const input = "Para 1\n\nPara 2\n\n";
      const blocks = detector.feed(input);

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        content: "Para 1",
        startOffset: 0,
        endOffset: 6,
      });
      expect(blocks[1]).toMatchObject({
        content: "Para 2",
        startOffset: 8,
        endOffset: 14,
      });
    });

    it("tracks offsets across chunked input", () => {
      const detector = new BlockDetector();
      detector.feed("Hello ");
      const blocks = detector.feed("world\n\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        content: "Hello world",
        startOffset: 0,
        endOffset: 11,
      });
    });
  });

  describe("chunk resilience", () => {
    /**
     * Property: feeding char-by-char should produce identical results to whole string
     */
    it("char-by-char equals whole string for paragraph", () => {
      const input = "Hello world\n\nAnother paragraph\n\n";

      const wholeDetector = new BlockDetector();
      const wholeBlocks = [
        ...wholeDetector.feed(input),
        ...wholeDetector.flush(),
      ];

      const charDetector = new BlockDetector();
      const charBlocks: CompletedBlock[] = [];
      for (const char of input) {
        charBlocks.push(...charDetector.feed(char));
      }
      charBlocks.push(...charDetector.flush());

      expect(charBlocks).toEqual(wholeBlocks);
    });

    it("char-by-char equals whole string for code block", () => {
      const input = "```typescript\nconst x = 1;\n```\n";

      const wholeDetector = new BlockDetector();
      const wholeBlocks = [
        ...wholeDetector.feed(input),
        ...wholeDetector.flush(),
      ];

      const charDetector = new BlockDetector();
      const charBlocks: CompletedBlock[] = [];
      for (const char of input) {
        charBlocks.push(...charDetector.feed(char));
      }
      charBlocks.push(...charDetector.flush());

      expect(charBlocks).toEqual(wholeBlocks);
    });

    it("char-by-char equals whole string for heading", () => {
      const input = "# Hello World\n## Second heading\n";

      const wholeDetector = new BlockDetector();
      const wholeBlocks = [
        ...wholeDetector.feed(input),
        ...wholeDetector.flush(),
      ];

      const charDetector = new BlockDetector();
      const charBlocks: CompletedBlock[] = [];
      for (const char of input) {
        charBlocks.push(...charDetector.feed(char));
      }
      charBlocks.push(...charDetector.flush());

      expect(charBlocks).toEqual(wholeBlocks);
    });

    it("char-by-char equals whole string for list", () => {
      const input = "- item 1\n- item 2\n\n";

      const wholeDetector = new BlockDetector();
      const wholeBlocks = [
        ...wholeDetector.feed(input),
        ...wholeDetector.flush(),
      ];

      const charDetector = new BlockDetector();
      const charBlocks: CompletedBlock[] = [];
      for (const char of input) {
        charBlocks.push(...charDetector.feed(char));
      }
      charBlocks.push(...charDetector.flush());

      expect(charBlocks).toEqual(wholeBlocks);
    });

    it("char-by-char equals whole string for mixed content", () => {
      const input = `# Title

Some paragraph text here.

\`\`\`js
const x = 1;
\`\`\`

- item 1
- item 2

> A quote

---

Another paragraph
`;

      const wholeDetector = new BlockDetector();
      const wholeBlocks = [
        ...wholeDetector.feed(input),
        ...wholeDetector.flush(),
      ];

      const charDetector = new BlockDetector();
      const charBlocks: CompletedBlock[] = [];
      for (const char of input) {
        charBlocks.push(...charDetector.feed(char));
      }
      charBlocks.push(...charDetector.flush());

      expect(charBlocks).toEqual(wholeBlocks);
    });

    it("random chunking produces same results as whole string", () => {
      const input = `# Heading

Paragraph with some text.

\`\`\`python
def hello():
    print("hi")
\`\`\`

1. First item
2. Second item

> Quote here

---
`;

      const wholeDetector = new BlockDetector();
      const wholeBlocks = [
        ...wholeDetector.feed(input),
        ...wholeDetector.flush(),
      ];

      // Test with various random chunk sizes
      for (const seed of [1, 7, 13, 42, 99]) {
        const chunkDetector = new BlockDetector();
        const chunkBlocks: CompletedBlock[] = [];

        let pos = 0;
        let rng = seed;
        while (pos < input.length) {
          // Simple LCG for deterministic "random" chunk sizes 1-10
          rng = (rng * 1103515245 + 12345) % 2147483648;
          const chunkSize = Math.max(1, (rng % 10) + 1);
          const chunk = input.slice(pos, pos + chunkSize);
          chunkBlocks.push(...chunkDetector.feed(chunk));
          pos += chunkSize;
        }
        chunkBlocks.push(...chunkDetector.flush());

        expect(chunkBlocks).toEqual(wholeBlocks);
      }
    });
  });

  describe("edge cases", () => {
    it("handles chunk split in middle of \\n\\n", () => {
      const detector = new BlockDetector();

      detector.feed("Hello\n");
      expect(detector.pending).toBe("Hello\n");

      const blocks = detector.feed("\nWorld\n\n");
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: "paragraph",
        content: "Hello",
      });
      expect(blocks[1]).toMatchObject({
        type: "paragraph",
        content: "World",
      });
    });

    it("handles chunk split in middle of code fence", () => {
      const detector = new BlockDetector();

      detector.feed("``");
      expect(detector.pending).toBe("``");

      detector.feed("`js\ncode");
      expect(detector.pending).toBe("```js\ncode");

      const blocks = detector.feed("\n```\n");
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "code",
        lang: "js",
      });
    });

    it("handles code fence with language hint split across chunks", () => {
      const detector = new BlockDetector();

      detector.feed("```type");
      detector.feed("script\nconst x = 1;\n```\n");

      // The first feed doesn't complete a fence (no newline after language)
      // Second feed completes it
      expect(detector.pending).toBe("");
    });

    it("handles nested code fences in markdown code block", () => {
      const detector = new BlockDetector();
      // A markdown code block that contains a code fence
      const input = "````markdown\n```js\ncode\n```\n````\n";
      const blocks = detector.feed(input);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "code",
        lang: "markdown",
      });
      expect(blocks[0]?.content).toContain("```js");
    });

    it("handles tilde code fences", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("~~~python\nprint('hi')\n~~~\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "code",
        lang: "python",
      });
    });

    it("handles empty code block", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("```\n```\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "code",
        content: "```\n```",
      });
    });

    it("handles code block with only whitespace", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("```\n   \n```\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "code",
        content: "```\n   \n```",
      });
    });

    it("handles empty paragraph (only whitespace between double newlines)", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("\n\n");

      expect(blocks).toHaveLength(0);
    });

    it("handles multiple consecutive blank lines", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("Para 1\n\n\n\nPara 2\n\n");

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: "paragraph",
        content: "Para 1",
      });
      expect(blocks[1]).toMatchObject({
        type: "paragraph",
        content: "Para 2",
      });
    });

    it("handles heading without trailing newline via flush", () => {
      const detector = new BlockDetector();
      detector.feed("# Heading");
      const blocks = detector.flush();

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "heading",
        content: "# Heading",
      });
    });

    it("handles list item with continuation lines", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("- item 1\n  continuation\n- item 2\n\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "list",
        content: "- item 1\n  continuation\n- item 2",
      });
    });

    it("handles blockquote with empty > line", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("> line 1\n>\n> line 2\n\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "blockquote",
      });
    });

    it("does not treat # in middle of line as heading", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("This is not # a heading\n\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "paragraph",
        content: "This is not # a heading",
      });
    });

    it("does not treat code fence in middle of line as code block", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("Use ```code``` for inline\n\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    it("handles longer closing fence than opening", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("```\ncode\n`````\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "code",
        content: "```\ncode\n`````",
      });
    });

    it("does not close code block with shorter fence", () => {
      const detector = new BlockDetector();
      detector.feed("````\ncode\n```\nmore\n");
      const blocks = detector.flush();

      // The ``` should not close the ```` block
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.content).toContain("```\nmore");
    });

    it("handles multiple blocks in sequence", () => {
      const detector = new BlockDetector();
      const input = `# Title

Para 1

Para 2

---

\`\`\`js
code
\`\`\`

- list

> quote
`;

      const blocks = [...detector.feed(input), ...detector.flush()];

      const types = blocks.map((b) => b.type);
      expect(types).toEqual([
        "heading",
        "paragraph",
        "paragraph",
        "hr",
        "code",
        "list",
        "blockquote",
      ]);
    });
  });

  describe("special markdown patterns", () => {
    it("handles setext-style heading indicators as HR", () => {
      // Note: we're treating --- as HR, not as setext heading underline
      // This is simpler for streaming parsing
      const detector = new BlockDetector();
      const blocks = detector.feed("---\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({ type: "hr" });
    });

    it("handles longer HR markers", () => {
      const detector = new BlockDetector();
      const blocks = detector.feed("----------\n");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "hr",
        content: "----------",
      });
    });

    it("does not treat bullet marker alone as list", () => {
      const detector = new BlockDetector();
      // "- " with nothing after needs space
      const blocks = detector.feed("-\n\n");

      expect(blocks).toHaveLength(1);
      // Just "-" is not a list item, it's paragraph
      expect(blocks[0]).toMatchObject({ type: "paragraph" });
    });
  });

  describe("streaming code blocks", () => {
    it("returns null when not in a code block", () => {
      const detector = new BlockDetector();
      detector.feed("Hello world");

      expect(detector.getStreamingCodeBlock()).toBeNull();
    });

    it("returns null for paragraph state", () => {
      const detector = new BlockDetector();
      detector.feed("Some paragraph text\nmore text");

      expect(detector.getStreamingCodeBlock()).toBeNull();
    });

    it("returns streaming code block when in code state", () => {
      const detector = new BlockDetector();
      detector.feed("```typescript\n");

      const streaming = detector.getStreamingCodeBlock();
      expect(streaming).not.toBeNull();
      expect(streaming).toMatchObject({
        content: "```typescript\n",
        lang: "typescript",
        startOffset: 0,
      });
    });

    it("returns streaming code block with accumulated content", () => {
      const detector = new BlockDetector();
      detector.feed("```js\nconst x = 1;\nconst y = 2;");

      const streaming = detector.getStreamingCodeBlock();
      expect(streaming).not.toBeNull();
      expect(streaming).toMatchObject({
        content: "```js\nconst x = 1;\nconst y = 2;",
        lang: "js",
        startOffset: 0,
      });
    });

    it("returns null after code block completes", () => {
      const detector = new BlockDetector();
      detector.feed("```js\ncode\n```\n");

      expect(detector.getStreamingCodeBlock()).toBeNull();
    });

    it("handles code block without language", () => {
      const detector = new BlockDetector();
      detector.feed("```\nsome code");

      const streaming = detector.getStreamingCodeBlock();
      expect(streaming).not.toBeNull();
      expect(streaming?.lang).toBeUndefined();
      expect(streaming?.content).toBe("```\nsome code");
    });

    it("handles tilde code fence", () => {
      const detector = new BlockDetector();
      detector.feed("~~~python\nprint('hi')");

      const streaming = detector.getStreamingCodeBlock();
      expect(streaming).not.toBeNull();
      expect(streaming).toMatchObject({
        lang: "python",
        content: "~~~python\nprint('hi')",
      });
    });

    it("updates content as more chunks arrive", () => {
      const detector = new BlockDetector();

      detector.feed("```ts\n");
      let streaming = detector.getStreamingCodeBlock();
      expect(streaming?.content).toBe("```ts\n");

      detector.feed("const x = 1;");
      streaming = detector.getStreamingCodeBlock();
      expect(streaming?.content).toBe("```ts\nconst x = 1;");

      detector.feed("\nconst y = 2;");
      streaming = detector.getStreamingCodeBlock();
      expect(streaming?.content).toBe("```ts\nconst x = 1;\nconst y = 2;");
    });

    it("tracks correct startOffset after preceding blocks", () => {
      const detector = new BlockDetector();

      // First, a paragraph
      detector.feed("Hello\n\n");
      // Now a code block
      detector.feed("```js\ncode");

      const streaming = detector.getStreamingCodeBlock();
      expect(streaming).not.toBeNull();
      expect(streaming?.startOffset).toBe(7); // "Hello\n\n" is 7 chars (0-indexed), code starts at 7
    });

    it("char-by-char streaming code block matches whole string", () => {
      const input = "```typescript\nconst x = 1;\nconst y = 2;";

      // Feed whole string
      const wholeDetector = new BlockDetector();
      wholeDetector.feed(input);
      const wholeStreaming = wholeDetector.getStreamingCodeBlock();

      // Feed char by char
      const charDetector = new BlockDetector();
      for (const char of input) {
        charDetector.feed(char);
      }
      const charStreaming = charDetector.getStreamingCodeBlock();

      expect(charStreaming).toEqual(wholeStreaming);
    });
  });
});
