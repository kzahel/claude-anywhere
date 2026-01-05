import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AgentContentContext } from "../../contexts/AgentContentContext";
import { useMarkdownAugment } from "../../contexts/MarkdownAugmentContext";
import { useStreamingMarkdownContext } from "../../contexts/StreamingMarkdownContext";
import { useStreamingMarkdown } from "../../hooks/useStreamingMarkdown";
import { FileViewer } from "../FileViewer";

interface Props {
  /** Block ID for looking up pre-rendered augments (format: messageId-blockIndex) */
  id?: string;
  text: string;
  isStreaming?: boolean;
}

/** State for the file viewer modal */
interface FileViewerState {
  filePath: string;
  lineNumber?: number;
}

export const TextBlock = memo(function TextBlock({
  id,
  text,
  isStreaming = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [fileViewer, setFileViewer] = useState<FileViewerState | null>(null);
  const agentContext = useContext(AgentContentContext);
  const projectId = agentContext?.projectId;

  // Pre-rendered markdown augment from server (for historical messages)
  const markdownAugment = useMarkdownAugment(id);

  // Streaming markdown hook for server-rendered content
  const streamingMarkdown = useStreamingMarkdown();
  const streamingContext = useStreamingMarkdownContext();

  // Track whether we're actively using streaming markdown (received at least one augment)
  const [useStreamingContent, setUseStreamingContent] = useState(false);

  // Track whether we've finished streaming (message_stop received)
  // This prevents resetting content when the final message arrives
  const streamingFinishedRef = useRef(false);

  // Reset streaming content only when a NEW streaming message starts,
  // not when the final message replaces the streaming placeholder
  useEffect(() => {
    // If we were streaming and isStreaming just became true again,
    // that means a new stream started - reset the previous content
    if (isStreaming && useStreamingContent && streamingFinishedRef.current) {
      setUseStreamingContent(false);
      streamingMarkdown.reset();
      streamingFinishedRef.current = false;
    }
  }, [isStreaming, useStreamingContent, streamingMarkdown]);

  // Register with context when streaming and context is available
  useEffect(() => {
    if (!isStreaming || !streamingContext) {
      // When streaming ends, DON'T reset the content - keep it displayed.
      // The server-rendered content has syntax highlighting we want to preserve.
      // Only unregister from the context (handled by cleanup return).
      return;
    }

    // Register handlers with the context
    const unregister = streamingContext.registerStreamingHandler({
      onAugment: (augment) => {
        // Mark that we're using streaming content on first augment
        setUseStreamingContent(true);
        streamingFinishedRef.current = false;
        streamingMarkdown.onAugment(augment);
      },
      onPending: streamingMarkdown.onPending,
      onStreamEnd: () => {
        // Mark streaming as finished so we don't reset content
        // when the final message arrives
        streamingFinishedRef.current = true;
        streamingMarkdown.onStreamEnd();
      },
    });

    return unregister;
  }, [isStreaming, streamingContext, streamingMarkdown]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  }, [text]);

  // Handle clicks on server-rendered file links (via event delegation)
  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't interfere with text selection (important for mobile long-press)
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        return;
      }

      const target = e.target as HTMLElement;
      const fileLink = target.closest("a.file-link");
      if (!fileLink || !projectId) return;

      e.preventDefault();
      e.stopPropagation();

      const filePath = fileLink.getAttribute("data-file-path");
      const lineStr = fileLink.getAttribute("data-line");

      if (filePath) {
        setFileViewer({
          filePath,
          lineNumber: lineStr ? Number.parseInt(lineStr, 10) : undefined,
        });
      }
    },
    [projectId],
  );

  // Handle middle-click on file links to open in new tab
  const handleContentAuxClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const fileLink = target.closest("a.file-link");
      if (!fileLink || !projectId) return;

      e.preventDefault();
      e.stopPropagation();

      const filePath = fileLink.getAttribute("data-file-path");
      if (filePath) {
        const url = `/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(filePath)}`;
        window.open(url, "_blank");
      }
    },
    [projectId],
  );

  const handleCloseFileViewer = useCallback(() => {
    setFileViewer(null);
  }, []);

  // Determine content rendering mode:
  // 1. During active streaming: use DOM refs for real-time updates (performance)
  // 2. After streaming ends OR if context has data: prefer context (survives remounts)
  // 3. Fallback: plain text
  //
  // Key insight: DOM refs are ephemeral (lost on remount), but context persists.
  // So after streaming ends, always prefer context which has accumulated all blocks.
  const preferContextAfterStreaming = !isStreaming && markdownAugment?.html;
  const showStreamingContent =
    useStreamingContent && !preferContextAfterStreaming;
  const showMarkdownAugment = !showStreamingContent && markdownAugment?.html;

  // Debug logging for streaming-to-final transition
  if (typeof window !== "undefined" && window.__STREAMING_DEBUG__) {
    console.log("[TextBlock] Render decision:", {
      id,
      isStreaming,
      useStreamingContent,
      hasMarkdownAugment: !!markdownAugment?.html,
      augmentHtmlLength: markdownAugment?.html?.length ?? 0,
      preferContextAfterStreaming: !!preferContextAfterStreaming,
      showStreamingContent,
      showMarkdownAugment: !!showMarkdownAugment,
      willRenderPlainText: !showStreamingContent && !showMarkdownAugment,
    });
  }

  return (
    <>
      <div
        className={`text-block timeline-item${isStreaming ? " streaming" : ""}`}
      >
        <button
          type="button"
          className={`text-block-copy ${copied ? "copied" : ""}`}
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy markdown"}
          aria-label={copied ? "Copied!" : "Copy markdown"}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>

        {showStreamingContent ? (
          // Server-rendered streaming content (received via SSE)
          <>
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: file links are anchor tags with href="#" */}
            <div
              ref={streamingMarkdown.containerRef}
              className="streaming-blocks"
              onClick={handleContentClick}
              onAuxClick={handleContentAuxClick}
            />
            <span
              ref={streamingMarkdown.pendingRef}
              className="streaming-pending"
            />
          </>
        ) : showMarkdownAugment ? (
          // Pre-rendered HTML from server (for historical messages on reload)
          // Uses same rendering as streaming, so code blocks have identical highlighting
          // biome-ignore lint/a11y/useKeyWithClickEvents: file links are anchor tags with href="#"
          <div
            className="streaming-blocks"
            onClick={handleContentClick}
            onAuxClick={handleContentAuxClick}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted server-rendered content
            dangerouslySetInnerHTML={{ __html: markdownAugment.html }}
          />
        ) : (
          // No augments available - show plain text
          <p>{text}</p>
        )}
      </div>

      {/* File viewer modal */}
      {fileViewer &&
        projectId &&
        createPortal(
          <FileViewerModal
            projectId={projectId}
            filePath={fileViewer.filePath}
            lineNumber={fileViewer.lineNumber}
            onClose={handleCloseFileViewer}
          />,
          document.body,
        )}
    </>
  );
});

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5L6.5 12L13 4" />
    </svg>
  );
}

/**
 * Modal wrapper for FileViewer.
 */
function FileViewerModal({
  projectId,
  filePath,
  lineNumber,
  onClose,
}: {
  projectId: string;
  filePath: string;
  lineNumber?: number;
  onClose: () => void;
}) {
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape key handled in useEffect, click is for overlay dismiss
    <div
      className="file-viewer-modal-overlay"
      onClick={handleOverlayClick}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: click only stops propagation, keyboard handled globally */}
      <dialog
        className="file-viewer-modal"
        open
        onClick={(e) => e.stopPropagation()}
      >
        <FileViewer
          projectId={projectId}
          filePath={filePath}
          lineNumber={lineNumber}
          onClose={onClose}
        />
      </dialog>
    </div>
  );
}
