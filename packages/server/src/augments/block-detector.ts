/**
 * BlockDetector - Streaming markdown parser that detects complete blocks
 *
 * This class processes markdown text in streaming chunks and identifies
 * when complete markdown blocks (paragraphs, headings, code blocks, etc.)
 * have been fully received. This enables server-side rendering of
 * completed blocks while the rest of the content is still streaming.
 */

export interface CompletedBlock {
  type: "paragraph" | "heading" | "code" | "list" | "blockquote" | "hr";
  content: string;
  lang?: string; // for code blocks
  startOffset: number;
  endOffset: number;
}

export interface StreamingCodeBlock {
  content: string;
  lang?: string;
  startOffset: number;
}

type BlockState =
  | { kind: "none" }
  | { kind: "paragraph"; startOffset: number }
  | { kind: "heading"; startOffset: number }
  | { kind: "code"; startOffset: number; lang: string; fence: string }
  | { kind: "list"; startOffset: number; listType: "bullet" | "numbered" }
  | { kind: "blockquote"; startOffset: number };

export class BlockDetector {
  private buffer = "";
  private offset = 0;
  private state: BlockState = { kind: "none" };

  /**
   * Feed a chunk of markdown text to the detector.
   * Returns any blocks that have been completed by this chunk.
   */
  feed(chunk: string): CompletedBlock[] {
    this.buffer += chunk;
    return this.processBuffer();
  }

  /**
   * Flush remaining content as a final block.
   * Call this at end of stream to capture any pending content.
   */
  flush(): CompletedBlock[] {
    const blocks: CompletedBlock[] = [];

    const content = this.buffer.trim();
    if (!content) {
      this.buffer = "";
      this.state = { kind: "none" };
      return blocks;
    }

    if (this.state.kind !== "none") {
      blocks.push(this.finalizeCurrentBlock());
    } else {
      // Content without explicit block state - determine type from first line
      const firstLine = this.buffer.trimStart().split("\n")[0] || "";
      const blockType = this.determineBlockType(firstLine);
      blocks.push({
        type: blockType,
        content,
        startOffset: this.offset,
        endOffset: this.offset + this.buffer.length,
        ...(blockType === "code"
          ? { lang: this.extractCodeLang(firstLine) }
          : {}),
      });
    }

    this.buffer = "";
    this.state = { kind: "none" };
    return blocks;
  }

  /**
   * Get the pending content that hasn't formed a complete block yet.
   */
  get pending(): string {
    return this.buffer;
  }

  /**
   * Get the current streaming code block if we're in a code block state.
   * Returns null if not currently inside a code block.
   * This enables optimistic rendering of code blocks before the closing fence.
   */
  getStreamingCodeBlock(): StreamingCodeBlock | null {
    if (this.state.kind !== "code") {
      return null;
    }

    return {
      content: this.buffer,
      lang: this.state.lang || undefined,
      startOffset: this.state.startOffset,
    };
  }

  private processBuffer(): CompletedBlock[] {
    const blocks: CompletedBlock[] = [];

    while (true) {
      const block = this.tryExtractBlock();
      if (block) {
        blocks.push(block);
      } else {
        break;
      }
    }

    return blocks;
  }

  private tryExtractBlock(): CompletedBlock | null {
    // Skip leading empty lines when in none state
    if (this.state.kind === "none") {
      while (this.buffer.startsWith("\n")) {
        this.consumeChars(1);
      }
      if (this.buffer === "") {
        return null;
      }
    }

    // Handle code blocks specially - they need to find the closing fence
    if (this.state.kind === "code") {
      return this.tryCompleteCodeBlock();
    }

    // If we're in a block state, check for completion
    if (this.state.kind !== "none") {
      return this.tryCompleteCurrentBlock();
    }

    // Try to start and possibly complete a new block
    return this.tryStartBlock();
  }

  private tryStartBlock(): CompletedBlock | null {
    if (this.buffer === "") {
      return null;
    }

    // We need at least one complete line (ending with \n) to identify the block type
    // UNLESS we're checking for things that can be identified mid-line
    const firstNewline = this.buffer.indexOf("\n");
    const hasCompleteLine = firstNewline !== -1;
    const firstLine = hasCompleteLine
      ? this.buffer.slice(0, firstNewline)
      : this.buffer;

    // Check for HR (must be checked before other blocks)
    // HR can be detected even without trailing newline if we have the full pattern
    if (this.isHorizontalRule(firstLine)) {
      if (hasCompleteLine) {
        return this.extractHR();
      }
      // Wait for newline to confirm HR
      return null;
    }

    // Check for code fence - need complete first line to detect
    if (hasCompleteLine) {
      const fenceMatch = firstLine.match(/^(`{3,}|~{3,})(\w*)$/);
      if (fenceMatch?.[1]) {
        this.state = {
          kind: "code",
          startOffset: this.offset,
          lang: fenceMatch[2] || "",
          fence: fenceMatch[1],
        };
        // Try to complete in this same call
        return this.tryCompleteCodeBlock();
      }
    }

    // Check for heading
    if (/^#{1,6}\s/.test(firstLine)) {
      if (hasCompleteLine) {
        return this.tryExtractHeading();
      }
      // Wait for newline
      this.state = { kind: "heading", startOffset: this.offset };
      return null;
    }

    // Check for blockquote
    if (firstLine.startsWith("> ") || firstLine === ">") {
      this.state = { kind: "blockquote", startOffset: this.offset };
      return this.tryCompleteBlockquote();
    }

    // Check for bullet list
    if (/^[-*]\s/.test(firstLine)) {
      this.state = {
        kind: "list",
        startOffset: this.offset,
        listType: "bullet",
      };
      return this.tryCompleteList();
    }

    // Check for numbered list
    if (/^\d+\.\s/.test(firstLine)) {
      this.state = {
        kind: "list",
        startOffset: this.offset,
        listType: "numbered",
      };
      return this.tryCompleteList();
    }

    // Start a paragraph if there's non-whitespace content
    // But only if the line is complete OR doesn't look like it could become another block type
    if (firstLine.trim()) {
      if (hasCompleteLine || !this.couldBeBlockStart(firstLine)) {
        this.state = { kind: "paragraph", startOffset: this.offset };
        return this.tryCompleteParagraph();
      }
      // Wait for more input - this could become a heading, list, etc.
      return null;
    }

    return null;
  }

  /**
   * Check if a partial line could potentially become a block start marker
   * when more characters are added.
   */
  private couldBeBlockStart(line: string): boolean {
    // Could become a heading
    if (/^#{1,6}$/.test(line)) return true;

    // Could become a code fence
    if (/^[`~]+$/.test(line)) return true;
    if (/^(`{3,}|~{3,})\w*$/.test(line)) return true;

    // Could become a list (need to check if just the marker or with space)
    if (line === "-" || line === "*") return true;
    if (/^\d+\.?$/.test(line)) return true;

    // Could become a blockquote
    if (line === ">") return true;

    // Could become HR
    if (/^[-*_]+$/.test(line)) return true;

    return false;
  }

  private tryCompleteCurrentBlock(): CompletedBlock | null {
    switch (this.state.kind) {
      case "paragraph":
        return this.tryCompleteParagraph();
      case "heading":
        return this.tryCompleteHeading();
      case "list":
        return this.tryCompleteList();
      case "blockquote":
        return this.tryCompleteBlockquote();
      default:
        return null;
    }
  }

  private tryExtractHeading(): CompletedBlock | null {
    const newlineIdx = this.buffer.indexOf("\n");
    if (newlineIdx === -1) {
      // No newline yet, can't complete the heading
      this.state = { kind: "heading", startOffset: this.offset };
      return null;
    }

    const headingContent = this.buffer.slice(0, newlineIdx);
    const startOffset = this.offset;

    const block: CompletedBlock = {
      type: "heading",
      content: headingContent,
      startOffset,
      endOffset: this.offset + newlineIdx,
    };

    this.consumeChars(newlineIdx + 1);
    this.state = { kind: "none" };
    return block;
  }

  private tryCompleteHeading(): CompletedBlock | null {
    const newlineIdx = this.buffer.indexOf("\n");
    if (newlineIdx === -1) {
      return null;
    }

    const headingContent = this.buffer.slice(0, newlineIdx);
    const startOffset =
      this.state.kind === "heading" ? this.state.startOffset : this.offset;

    const block: CompletedBlock = {
      type: "heading",
      content: headingContent,
      startOffset,
      endOffset: this.offset + newlineIdx,
    };

    this.consumeChars(newlineIdx + 1);
    this.state = { kind: "none" };
    return block;
  }

  private tryCompleteParagraph(): CompletedBlock | null {
    const startOffset =
      this.state.kind === "paragraph" ? this.state.startOffset : this.offset;

    // Check if a different block type starts on a subsequent line FIRST
    // Only check BEFORE the first empty line (which indicates paragraph break)
    const lines = this.buffer.split("\n");
    if (lines.length >= 2) {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;

        // Stop checking once we hit an empty line (paragraph boundary)
        if (line === "") {
          break;
        }

        // Only check if this line is complete (not the last element unless buffer ends with \n)
        const isCompleteLine =
          i < lines.length - 1 || this.buffer.endsWith("\n");

        if (isCompleteLine && this.isBlockStart(line)) {
          // Different block starts - complete paragraph up to this line
          const endIdx = this.findLineStartIndex(i);
          const content = this.buffer.slice(0, endIdx).trim();
          if (content) {
            const block: CompletedBlock = {
              type: "paragraph",
              content,
              startOffset,
              endOffset: this.offset + endIdx - 1, // -1 to not include the trailing newline
            };
            this.consumeChars(endIdx);
            this.state = { kind: "none" };
            return block;
          }
        }
      }
    }

    // Check for double newline (paragraph end)
    const doubleNewlineIdx = this.buffer.indexOf("\n\n");
    if (doubleNewlineIdx !== -1) {
      const content = this.buffer.slice(0, doubleNewlineIdx).trim();
      if (content) {
        const block: CompletedBlock = {
          type: "paragraph",
          content,
          startOffset,
          endOffset: this.offset + doubleNewlineIdx,
        };
        this.consumeChars(doubleNewlineIdx + 2);
        this.state = { kind: "none" };
        return block;
      }
      this.consumeChars(doubleNewlineIdx + 2);
      this.state = { kind: "none" };
      return null;
    }

    return null;
  }

  private tryCompleteList(): CompletedBlock | null {
    if (this.state.kind !== "list") return null;

    const { listType, startOffset } = this.state;

    // Check for double newline (list end)
    const doubleNewlineIdx = this.buffer.indexOf("\n\n");
    if (doubleNewlineIdx !== -1) {
      const content = this.buffer.slice(0, doubleNewlineIdx).trim();
      if (content) {
        const block: CompletedBlock = {
          type: "list",
          content,
          startOffset,
          endOffset: this.offset + doubleNewlineIdx,
        };
        this.consumeChars(doubleNewlineIdx + 2);
        this.state = { kind: "none" };
        return block;
      }
      this.consumeChars(doubleNewlineIdx + 2);
      this.state = { kind: "none" };
      return null;
    }

    // Check for a different block type starting
    const lines = this.buffer.split("\n");
    if (lines.length < 2) {
      return null;
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      const isCompleteLine = i < lines.length - 1 || this.buffer.endsWith("\n");

      // List continues if line starts with list marker or is indented continuation or empty
      const isBulletContinuation =
        listType === "bullet" &&
        (/^[-*]\s/.test(line) || /^\s+\S/.test(line) || line === "");
      const isNumberedContinuation =
        listType === "numbered" &&
        (/^\d+\.\s/.test(line) || /^\s+\S/.test(line) || line === "");
      const isContinuation = isBulletContinuation || isNumberedContinuation;

      if (isCompleteLine && !isContinuation && this.isBlockStart(line)) {
        const endIdx = this.findLineStartIndex(i);
        const content = this.buffer.slice(0, endIdx).trim();
        if (content) {
          const block: CompletedBlock = {
            type: "list",
            content,
            startOffset,
            endOffset: this.offset + endIdx - 1,
          };
          this.consumeChars(endIdx);
          this.state = { kind: "none" };
          return block;
        }
      }
    }

    return null;
  }

  private tryCompleteBlockquote(): CompletedBlock | null {
    if (this.state.kind !== "blockquote") return null;

    const { startOffset } = this.state;

    // Check for non-blockquote line FIRST (takes precedence over \n\n)
    const lines = this.buffer.split("\n");
    if (lines.length >= 2) {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        const isCompleteLine =
          i < lines.length - 1 || this.buffer.endsWith("\n");

        // Blockquote continues if line starts with > or is empty
        const isBlockquoteLine = line.startsWith(">") || line === "";

        if (isCompleteLine && !isBlockquoteLine) {
          const endIdx = this.findLineStartIndex(i);
          const rawContent = this.buffer.slice(0, endIdx);
          const content = rawContent.trim();
          if (content) {
            // endOffset points to last char of actual content (before trailing whitespace)
            const contentEndInRaw = rawContent.trimEnd().length - 1;
            const block: CompletedBlock = {
              type: "blockquote",
              content,
              startOffset,
              endOffset: this.offset + contentEndInRaw,
            };
            this.consumeChars(endIdx);
            this.state = { kind: "none" };
            return block;
          }
        }
      }
    }

    // Check for double newline (blockquote end)
    const doubleNewlineIdx = this.buffer.indexOf("\n\n");
    if (doubleNewlineIdx !== -1) {
      const rawContent = this.buffer.slice(0, doubleNewlineIdx);
      const content = rawContent.trim();
      if (content) {
        // endOffset points to last char of actual content (before trailing whitespace)
        const contentEndInRaw = rawContent.trimEnd().length - 1;
        const block: CompletedBlock = {
          type: "blockquote",
          content,
          startOffset,
          endOffset: this.offset + contentEndInRaw,
        };
        this.consumeChars(doubleNewlineIdx + 2);
        this.state = { kind: "none" };
        return block;
      }
      this.consumeChars(doubleNewlineIdx + 2);
      this.state = { kind: "none" };
      return null;
    }

    return null;
  }

  private tryCompleteCodeBlock(): CompletedBlock | null {
    if (this.state.kind !== "code") return null;

    const { startOffset, lang, fence } = this.state;

    // Look for closing fence - need at least 2 lines
    const lines = this.buffer.split("\n");
    if (lines.length < 2) {
      return null;
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      // Only check complete lines (either not the last, or buffer ends with \n)
      const isCompleteLine = i < lines.length - 1 || this.buffer.endsWith("\n");

      if (isCompleteLine && this.isClosingFence(line, fence)) {
        const endIdx = this.findLineStartIndex(i) + line.length;
        const newlineAfter =
          this.buffer.length > endIdx && this.buffer[endIdx] === "\n" ? 1 : 0;

        const content = this.buffer.slice(0, endIdx);
        const block: CompletedBlock = {
          type: "code",
          content,
          lang: lang || undefined,
          startOffset,
          endOffset: this.offset + endIdx,
        };

        this.consumeChars(endIdx + newlineAfter);
        this.state = { kind: "none" };
        return block;
      }
    }

    return null;
  }

  private isClosingFence(line: string, openingFence: string): boolean {
    const trimmed = line.trim();
    const fenceChar = openingFence.charAt(0);

    // Must be only fence characters (same type) and at least as long as opening
    if (fenceChar === "`") {
      return /^`{3,}$/.test(trimmed) && trimmed.length >= openingFence.length;
    }
    if (fenceChar === "~") {
      return /^~{3,}$/.test(trimmed) && trimmed.length >= openingFence.length;
    }
    return false;
  }

  private extractHR(): CompletedBlock | null {
    const newlineIdx = this.buffer.indexOf("\n");
    const endIdx = newlineIdx !== -1 ? newlineIdx : this.buffer.length;

    const block: CompletedBlock = {
      type: "hr",
      content: this.buffer.slice(0, endIdx),
      startOffset: this.offset,
      endOffset: this.offset + endIdx,
    };

    this.consumeChars(endIdx + (newlineIdx !== -1 ? 1 : 0));
    this.state = { kind: "none" };
    return block;
  }

  private isHorizontalRule(line: string): boolean {
    const trimmed = line.trim();
    return /^(---+|\*\*\*+|___+)$/.test(trimmed);
  }

  private isBlockStart(line: string): boolean {
    if (line === "") return false;

    // Code fence - check for start of fence pattern
    if (/^(`{3,}|~{3,})(\w*)$/.test(line)) return true;

    // Heading
    if (/^#{1,6}\s/.test(line)) return true;

    // HR
    if (this.isHorizontalRule(line)) return true;

    // Blockquote
    if (line.startsWith("> ") || line === ">") return true;

    // Bullet list
    if (/^[-*]\s/.test(line)) return true;

    // Numbered list
    if (/^\d+\.\s/.test(line)) return true;

    return false;
  }

  private findLineStartIndex(lineNumber: number): number {
    let idx = 0;
    let currentLine = 0;

    while (currentLine < lineNumber && idx < this.buffer.length) {
      if (this.buffer[idx] === "\n") {
        currentLine++;
      }
      idx++;
    }

    return idx;
  }

  private consumeChars(count: number): void {
    this.buffer = this.buffer.slice(count);
    this.offset += count;
  }

  private determineBlockType(line: string): CompletedBlock["type"] {
    if (/^#{1,6}\s/.test(line)) return "heading";
    if (/^(`{3,}|~{3,})/.test(line)) return "code";
    if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) return "list";
    if (line.startsWith("> ") || line === ">") return "blockquote";
    if (this.isHorizontalRule(line)) return "hr";
    return "paragraph";
  }

  private extractCodeLang(line: string): string | undefined {
    const match = line.match(/^(`{3,}|~{3,})(\w*)/);
    return match?.[2] || undefined;
  }

  private finalizeCurrentBlock(): CompletedBlock {
    const content = this.buffer.trim();

    switch (this.state.kind) {
      case "paragraph":
        return {
          type: "paragraph",
          content,
          startOffset: this.state.startOffset,
          endOffset: this.offset + this.buffer.length,
        };
      case "heading":
        return {
          type: "heading",
          content,
          startOffset: this.state.startOffset,
          endOffset: this.offset + this.buffer.length,
        };
      case "code": {
        return {
          type: "code",
          content: this.buffer.trimEnd(),
          lang: this.state.lang || undefined,
          startOffset: this.state.startOffset,
          endOffset: this.offset + this.buffer.length,
        };
      }
      case "list":
        return {
          type: "list",
          content,
          startOffset: this.state.startOffset,
          endOffset: this.offset + this.buffer.length,
        };
      case "blockquote":
        return {
          type: "blockquote",
          content,
          startOffset: this.state.startOffset,
          endOffset: this.offset + this.buffer.length,
        };
      default:
        return {
          type: "paragraph",
          content,
          startOffset: this.offset,
          endOffset: this.offset + this.buffer.length,
        };
    }
  }
}
