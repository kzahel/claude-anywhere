import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStreamingMarkdown } from "../useStreamingMarkdown";

describe("useStreamingMarkdown", () => {
  let container: HTMLDivElement;
  let pending: HTMLSpanElement;

  beforeEach(() => {
    container = document.createElement("div");
    pending = document.createElement("span");
    document.body.appendChild(container);
    document.body.appendChild(pending);
  });

  afterEach(() => {
    document.body.removeChild(container);
    document.body.removeChild(pending);
  });

  // Helper to attach refs to DOM elements
  function attachRefs(result: ReturnType<typeof useStreamingMarkdown>) {
    (result.containerRef as React.MutableRefObject<HTMLDivElement>).current =
      container;
    (result.pendingRef as React.MutableRefObject<HTMLSpanElement>).current =
      pending;
  }

  it("starts with isStreaming false", () => {
    const { result } = renderHook(() => useStreamingMarkdown());
    expect(result.current.isStreaming).toBe(false);
  });

  it("sets isStreaming true on first augment", () => {
    const { result } = renderHook(() => useStreamingMarkdown());
    attachRefs(result.current);

    act(() => {
      result.current.onAugment({
        blockIndex: 0,
        html: "<p>Hello</p>",
        type: "paragraph",
      });
    });

    expect(result.current.isStreaming).toBe(true);
  });

  it("appends augments to container", () => {
    const { result } = renderHook(() => useStreamingMarkdown());
    attachRefs(result.current);

    act(() => {
      result.current.onAugment({
        blockIndex: 0,
        html: "<p>First</p>",
        type: "paragraph",
      });
      result.current.onAugment({
        blockIndex: 1,
        html: "<p>Second</p>",
        type: "paragraph",
      });
    });

    expect(container.children.length).toBe(2);
    expect(container.children[0]?.innerHTML).toBe("<p>First</p>");
    expect(container.children[1]?.innerHTML).toBe("<p>Second</p>");
  });

  it("handles out-of-order augments", () => {
    const { result } = renderHook(() => useStreamingMarkdown());
    attachRefs(result.current);

    act(() => {
      // Send blocks out of order
      result.current.onAugment({
        blockIndex: 2,
        html: "<p>Third</p>",
        type: "paragraph",
      });
      result.current.onAugment({
        blockIndex: 0,
        html: "<p>First</p>",
        type: "paragraph",
      });
      result.current.onAugment({
        blockIndex: 1,
        html: "<p>Second</p>",
        type: "paragraph",
      });
    });

    expect(container.children.length).toBe(3);
    // Should be in correct order based on blockIndex
    expect((container.children[0] as HTMLElement).dataset.blockIndex).toBe("0");
    expect((container.children[1] as HTMLElement).dataset.blockIndex).toBe("1");
    expect((container.children[2] as HTMLElement).dataset.blockIndex).toBe("2");
  });

  it("deduplicates augments with same blockIndex", () => {
    const { result } = renderHook(() => useStreamingMarkdown());
    attachRefs(result.current);

    act(() => {
      result.current.onAugment({
        blockIndex: 0,
        html: "<p>Original</p>",
        type: "paragraph",
      });
      result.current.onAugment({
        blockIndex: 0,
        html: "<p>Updated</p>",
        type: "paragraph",
      });
    });

    expect(container.children.length).toBe(1);
    expect(container.children[0]?.innerHTML).toBe("<p>Updated</p>");
  });

  it("updates pending text", () => {
    const { result } = renderHook(() => useStreamingMarkdown());
    attachRefs(result.current);

    act(() => {
      result.current.onPending({ html: "<strong>bold</strong> text..." });
    });

    expect(pending.innerHTML).toBe("<strong>bold</strong> text...");
    expect(result.current.isStreaming).toBe(true);
  });

  it("clears pending and sets isStreaming false on stream end", () => {
    const { result } = renderHook(() => useStreamingMarkdown());
    attachRefs(result.current);

    act(() => {
      result.current.onPending({ html: "pending..." });
    });

    expect(result.current.isStreaming).toBe(true);
    expect(pending.innerHTML).toBe("pending...");

    act(() => {
      result.current.onStreamEnd();
    });

    expect(result.current.isStreaming).toBe(false);
    expect(pending.innerHTML).toBe("");
  });

  it("reset clears everything", () => {
    const { result } = renderHook(() => useStreamingMarkdown());
    attachRefs(result.current);

    act(() => {
      result.current.onAugment({
        blockIndex: 0,
        html: "<p>Block</p>",
        type: "paragraph",
      });
      result.current.onPending({ html: "pending..." });
    });

    expect(container.children.length).toBe(1);
    expect(pending.innerHTML).toBe("pending...");
    expect(result.current.isStreaming).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(container.innerHTML).toBe("");
    expect(pending.innerHTML).toBe("");
    expect(result.current.isStreaming).toBe(false);
  });

  it("handles augment without attached refs gracefully", () => {
    const { result } = renderHook(() => useStreamingMarkdown());

    // Don't attach refs - should not throw
    act(() => {
      result.current.onAugment({
        blockIndex: 0,
        html: "<p>Test</p>",
        type: "paragraph",
      });
      result.current.onPending({ html: "pending" });
      result.current.onStreamEnd();
      result.current.reset();
    });

    // Should not throw, isStreaming should still be false after reset
    expect(result.current.isStreaming).toBe(false);
  });

  it("maintains block order with gaps in indices", () => {
    const { result } = renderHook(() => useStreamingMarkdown());
    attachRefs(result.current);

    act(() => {
      // Simulate skipped indices (e.g., block 1 was filtered out)
      result.current.onAugment({
        blockIndex: 0,
        html: "<p>First</p>",
        type: "paragraph",
      });
      result.current.onAugment({
        blockIndex: 5,
        html: "<p>Fifth</p>",
        type: "paragraph",
      });
      result.current.onAugment({
        blockIndex: 2,
        html: "<p>Second</p>",
        type: "paragraph",
      });
    });

    expect(container.children.length).toBe(3);
    // Should maintain order by blockIndex
    expect((container.children[0] as HTMLElement).dataset.blockIndex).toBe("0");
    expect((container.children[1] as HTMLElement).dataset.blockIndex).toBe("2");
    expect((container.children[2] as HTMLElement).dataset.blockIndex).toBe("5");
  });
});
