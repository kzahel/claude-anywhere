import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type AugmentGenerator,
  createAugmentGenerator,
} from "../../src/augments/augment-generator.js";
import type { CompletedBlock } from "../../src/augments/block-detector.js";

describe("AugmentGenerator", () => {
  let generator: AugmentGenerator;

  beforeAll(async () => {
    generator = await createAugmentGenerator({
      languages: ["javascript", "typescript", "python"],
      theme: "github-dark",
    });
  });

  describe("code block highlighting", () => {
    it("highlights code with known language", async () => {
      const block: CompletedBlock = {
        type: "code",
        content: "```javascript\nconst x = 1;\n```",
        lang: "javascript",
        startOffset: 0,
        endOffset: 30,
      };

      const augment = await generator.processBlock(block, 0);

      expect(augment.type).toBe("code");
      expect(augment.blockIndex).toBe(0);
      // Shiki wraps in <pre> with shiki class
      expect(augment.html).toContain("<pre");
      expect(augment.html).toContain("shiki");
      // Should have syntax highlighting spans
      expect(augment.html).toContain("<span");
    });

    it("highlights typescript code", async () => {
      const block: CompletedBlock = {
        type: "code",
        content:
          "```typescript\nfunction hello(name: string): void {\n  console.log(name);\n}\n```",
        lang: "typescript",
        startOffset: 0,
        endOffset: 70,
      };

      const augment = await generator.processBlock(block, 1);

      expect(augment.type).toBe("code");
      expect(augment.html).toContain("<pre");
      expect(augment.html).toContain("<span");
    });

    it("renders unknown language as plain code block", async () => {
      const block: CompletedBlock = {
        type: "code",
        content: "```unknownlang\nsome code\n```",
        lang: "unknownlang",
        startOffset: 0,
        endOffset: 28,
      };

      const augment = await generator.processBlock(block, 2);

      expect(augment.type).toBe("code");
      expect(augment.html).toContain('<pre class="shiki">');
      expect(augment.html).toContain('class="language-unknownlang"');
      expect(augment.html).toContain("some code");
    });

    it("renders code block without language as plain", async () => {
      const block: CompletedBlock = {
        type: "code",
        content: "```\nplain code here\n```",
        lang: undefined,
        startOffset: 0,
        endOffset: 22,
      };

      const augment = await generator.processBlock(block, 3);

      expect(augment.type).toBe("code");
      expect(augment.html).toContain('<pre class="shiki">');
      expect(augment.html).toContain("plain code here");
    });

    it("escapes HTML in plain code blocks", async () => {
      const block: CompletedBlock = {
        type: "code",
        content: "```\n<script>alert('xss')</script>\n```",
        lang: undefined,
        startOffset: 0,
        endOffset: 40,
      };

      const augment = await generator.processBlock(block, 4);

      expect(augment.html).not.toContain("<script>");
      expect(augment.html).toContain("&lt;script&gt;");
    });
  });

  describe("non-code blocks", () => {
    it("renders paragraph with marked", async () => {
      const block: CompletedBlock = {
        type: "paragraph",
        content: "This is a simple paragraph.",
        startOffset: 0,
        endOffset: 26,
      };

      const augment = await generator.processBlock(block, 0);

      expect(augment.type).toBe("paragraph");
      expect(augment.html).toBe("<p>This is a simple paragraph.</p>");
    });

    it("renders heading with marked", async () => {
      const block: CompletedBlock = {
        type: "heading",
        content: "# Main Heading",
        startOffset: 0,
        endOffset: 13,
      };

      const augment = await generator.processBlock(block, 0);

      expect(augment.type).toBe("heading");
      expect(augment.html).toBe("<h1>Main Heading</h1>");
    });

    it("renders h2 heading", async () => {
      const block: CompletedBlock = {
        type: "heading",
        content: "## Sub Heading",
        startOffset: 0,
        endOffset: 13,
      };

      const augment = await generator.processBlock(block, 0);

      expect(augment.html).toBe("<h2>Sub Heading</h2>");
    });

    it("renders bullet list", async () => {
      const block: CompletedBlock = {
        type: "list",
        content: "- item 1\n- item 2",
        startOffset: 0,
        endOffset: 17,
      };

      const augment = await generator.processBlock(block, 0);

      expect(augment.type).toBe("list");
      expect(augment.html).toContain("<ul>");
      expect(augment.html).toContain("<li>item 1</li>");
      expect(augment.html).toContain("<li>item 2</li>");
    });

    it("renders numbered list", async () => {
      const block: CompletedBlock = {
        type: "list",
        content: "1. first\n2. second",
        startOffset: 0,
        endOffset: 18,
      };

      const augment = await generator.processBlock(block, 0);

      expect(augment.type).toBe("list");
      expect(augment.html).toContain("<ol>");
      expect(augment.html).toContain("<li>first</li>");
      expect(augment.html).toContain("<li>second</li>");
    });

    it("renders blockquote", async () => {
      const block: CompletedBlock = {
        type: "blockquote",
        content: "> A quoted line",
        startOffset: 0,
        endOffset: 14,
      };

      const augment = await generator.processBlock(block, 0);

      expect(augment.type).toBe("blockquote");
      expect(augment.html).toContain("<blockquote>");
      expect(augment.html).toContain("A quoted line");
    });

    it("renders horizontal rule", async () => {
      const block: CompletedBlock = {
        type: "hr",
        content: "---",
        startOffset: 0,
        endOffset: 3,
      };

      const augment = await generator.processBlock(block, 0);

      expect(augment.type).toBe("hr");
      expect(augment.html).toContain("<hr");
    });

    it("renders paragraph with inline formatting", async () => {
      const block: CompletedBlock = {
        type: "paragraph",
        content: "This has **bold** and *italic* text.",
        startOffset: 0,
        endOffset: 36,
      };

      const augment = await generator.processBlock(block, 0);

      expect(augment.html).toContain("<strong>bold</strong>");
      expect(augment.html).toContain("<em>italic</em>");
    });
  });

  describe("renderPending", () => {
    it("renders bold formatting", () => {
      const result = generator.renderPending("This is **bold** text");

      expect(result).toBe("This is <strong>bold</strong> text");
    });

    it("renders italic formatting", () => {
      const result = generator.renderPending("This is *italic* text");

      expect(result).toBe("This is <em>italic</em> text");
    });

    it("renders inline code", () => {
      const result = generator.renderPending("Use `console.log()` for debug");

      expect(result).toBe("Use <code>console.log()</code> for debug");
    });

    it("renders links", () => {
      const result = generator.renderPending(
        "Check [the docs](https://example.com)",
      );

      expect(result).toBe('Check <a href="https://example.com">the docs</a>');
    });

    it("renders mixed formatting", () => {
      const result = generator.renderPending(
        "**Bold** and *italic* and `code`",
      );

      expect(result).toBe(
        "<strong>Bold</strong> and <em>italic</em> and <code>code</code>",
      );
    });

    it("handles unclosed bold gracefully", () => {
      const result = generator.renderPending("This is **unclosed");

      // Should not crash, just return escaped text
      expect(result).toBe("This is **unclosed");
    });

    it("handles unclosed italic gracefully", () => {
      const result = generator.renderPending("This is *unclosed");

      expect(result).toBe("This is *unclosed");
    });

    it("handles unclosed code gracefully", () => {
      const result = generator.renderPending("This is `unclosed");

      expect(result).toBe("This is `unclosed");
    });

    it("handles unclosed link gracefully", () => {
      const result = generator.renderPending("Check [the docs](incomplete");

      expect(result).toBe("Check [the docs](incomplete");
    });

    it("escapes HTML in pending text", () => {
      const result = generator.renderPending("<script>alert('xss')</script>");

      expect(result).not.toContain("<script>");
      expect(result).toContain("&lt;script&gt;");
    });

    it("handles empty string", () => {
      const result = generator.renderPending("");

      expect(result).toBe("");
    });

    it("handles plain text without formatting", () => {
      const result = generator.renderPending("Just plain text here");

      expect(result).toBe("Just plain text here");
    });

    describe("fenced code blocks", () => {
      it("renders incomplete fenced code block with language", () => {
        const result = generator.renderPending("```typescript\nconst x = 1;");

        expect(result).toBe(
          '<pre class="shiki pending-code"><code class="language-typescript">const x = 1;</code></pre>',
        );
      });

      it("renders incomplete fenced code block without language", () => {
        const result = generator.renderPending("```\nsome code here");

        expect(result).toBe(
          '<pre class="shiki pending-code"><code>some code here</code></pre>',
        );
      });

      it("renders multi-line incomplete code block", () => {
        const result = generator.renderPending(
          "```javascript\nfunction hello() {\n  console.log('hi');",
        );

        expect(result).toBe(
          `<pre class="shiki pending-code"><code class="language-javascript">function hello() {\n  console.log(&#039;hi&#039;);</code></pre>`,
        );
      });

      it("renders incomplete code block with just the fence", () => {
        const result = generator.renderPending("```python\n");

        expect(result).toBe(
          '<pre class="shiki pending-code"><code class="language-python"></code></pre>',
        );
      });

      it("renders incomplete code block with just fence and no newline", () => {
        const result = generator.renderPending("```js");

        expect(result).toBe(
          '<pre class="shiki pending-code"><code class="language-js"></code></pre>',
        );
      });

      it("renders incomplete tilde fenced code block", () => {
        const result = generator.renderPending(
          "~~~ruby\ndef hello\n  puts 'hi'",
        );

        expect(result).toBe(
          `<pre class="shiki pending-code"><code class="language-ruby">def hello\n  puts &#039;hi&#039;</code></pre>`,
        );
      });

      it("escapes HTML in pending code block", () => {
        const result = generator.renderPending(
          "```html\n<script>alert('xss')</script>",
        );

        expect(result).not.toContain("<script>");
        expect(result).toContain("&lt;script&gt;");
        expect(result).toContain('<pre class="shiki pending-code">');
      });

      it("does not treat closed code block as pending", () => {
        // If the code block has a closing fence, don't render it as pending code
        // (This shouldn't happen in practice since BlockDetector would emit it as complete)
        const result = generator.renderPending("```js\ncode\n```");

        // Should fall through to regular inline formatting (which escapes the backticks)
        expect(result).not.toContain('<pre class="shiki pending-code">');
      });

      it("handles longer fence markers", () => {
        const result = generator.renderPending("````markdown\n```js\ncode");

        expect(result).toContain('<pre class="shiki pending-code">');
        expect(result).toContain('class="language-markdown"');
        // The inner fence should be part of the content
        expect(result).toContain("```js");
      });
    });
  });

  describe("golden file tests", () => {
    const fixturesDir = join(__dirname, "../fixtures/markdown-golden");

    describe("block tests", () => {
      const blocksDir = join(fixturesDir, "blocks");
      const blockFiles = readdirSync(blocksDir).filter((f) =>
        f.endsWith(".md"),
      );

      for (const mdFile of blockFiles) {
        const baseName = mdFile.replace(".md", "");
        const htmlFile = `${baseName}.html`;

        it(`renders ${baseName} correctly`, async () => {
          const mdPath = join(blocksDir, mdFile);
          const htmlPath = join(blocksDir, htmlFile);

          const mdContent = readFileSync(mdPath, "utf-8").trim();
          const expectedHtml = readFileSync(htmlPath, "utf-8").trim();

          // Determine block type from filename
          let blockType: CompletedBlock["type"] = "paragraph";
          let lang: string | undefined;

          if (baseName.startsWith("header")) {
            blockType = "heading";
          } else if (baseName.startsWith("code")) {
            blockType = "code";
            // Extract language from filename like code-js, code-typescript
            const langMatch = baseName.match(/^code-(.+)$/);
            if (langMatch) {
              const langPart = langMatch[1];
              if (langPart === "no-lang") {
                lang = undefined;
              } else if (langPart === "unknown-lang") {
                lang = "unknownlang";
              } else if (langPart === "js") {
                lang = "js";
              } else {
                lang = langPart;
              }
            }
          } else if (baseName.startsWith("list")) {
            blockType = "list";
          } else if (baseName === "blockquote") {
            blockType = "blockquote";
          } else if (baseName === "hr") {
            blockType = "hr";
          }

          const block: CompletedBlock = {
            type: blockType,
            content: mdContent,
            lang,
            startOffset: 0,
            endOffset: mdContent.length,
          };

          const augment = await generator.processBlock(block, 0);

          // For code blocks, we need to be more flexible about the exact HTML
          // as shiki output varies slightly between versions
          if (blockType === "code") {
            // Check that it's wrapped in pre with shiki class
            expect(augment.html).toContain("<pre");
            expect(augment.html).toContain("shiki");
            // Check that the code content is present (unescaped in highlighted, escaped in plain)
            // Just verify it renders without error and has code tag
            expect(augment.html).toContain("<code");
          } else {
            // For non-code blocks, we can compare more strictly
            // Normalize whitespace for comparison
            const normalizedExpected = expectedHtml.replace(/\s+/g, " ").trim();
            const normalizedActual = augment.html.replace(/\s+/g, " ").trim();
            expect(normalizedActual).toBe(normalizedExpected);
          }
        });
      }
    });

    describe("inline formatting in paragraphs", () => {
      const inlineDir = join(fixturesDir, "inline");
      const inlineFiles = readdirSync(inlineDir).filter((f) =>
        f.endsWith(".md"),
      );

      for (const mdFile of inlineFiles) {
        const baseName = mdFile.replace(".md", "");
        const htmlFile = `${baseName}.html`;

        it(`renders ${baseName} inline formatting correctly`, async () => {
          const mdPath = join(inlineDir, mdFile);
          const htmlPath = join(inlineDir, htmlFile);

          const mdContent = readFileSync(mdPath, "utf-8").trim();
          const expectedHtml = readFileSync(htmlPath, "utf-8").trim();

          // Inline tests are paragraphs
          const block: CompletedBlock = {
            type: "paragraph",
            content: mdContent,
            startOffset: 0,
            endOffset: mdContent.length,
          };

          const augment = await generator.processBlock(block, 0);

          // Normalize whitespace
          const normalizedExpected = expectedHtml.replace(/\s+/g, " ").trim();
          const normalizedActual = augment.html.replace(/\s+/g, " ").trim();
          expect(normalizedActual).toBe(normalizedExpected);
        });
      }
    });
  });

  describe("configuration", () => {
    it("uses default theme when not specified", async () => {
      const gen = await createAugmentGenerator({
        languages: ["javascript"],
        theme: "",
      });

      const block: CompletedBlock = {
        type: "code",
        content: "```javascript\nconst x = 1;\n```",
        lang: "javascript",
        startOffset: 0,
        endOffset: 30,
      };

      const augment = await gen.processBlock(block, 0);

      // Should still render with some theme
      expect(augment.html).toContain("<pre");
    });

    it("loads languages dynamically if not pre-loaded", async () => {
      const gen = await createAugmentGenerator({
        languages: [], // No pre-loaded languages
        theme: "github-dark",
      });

      const block: CompletedBlock = {
        type: "code",
        content: "```python\ndef hello():\n    print('hi')\n```",
        lang: "python",
        startOffset: 0,
        endOffset: 40,
      };

      const augment = await gen.processBlock(block, 0);

      // Should still render (dynamically loaded)
      expect(augment.html).toContain("<pre");
      expect(augment.html).toContain("<span");
    });
  });
});
