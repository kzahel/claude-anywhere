import { useCallback, useEffect, useState } from "react";
import type { ZodError } from "zod";
import { useSchemaValidationContext } from "../../../contexts/SchemaValidationContext";
import { validateToolResult } from "../../../lib/validateToolResult";
import { SchemaWarning } from "../../SchemaWarning";
import { Modal } from "../../ui/Modal";
import type { ToolRenderer, WriteInput, WriteResult } from "./types";

const MAX_LINES_COLLAPSED = 30;
const PREVIEW_LINES = 3;

/** Extended input type with embedded augment data from server */
interface WriteInputWithAugment extends WriteInput {
  _highlightedContentHtml?: string;
  _highlightedLanguage?: string;
  _highlightedTruncated?: boolean;
}

/**
 * Extract filename from path
 */
function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

/**
 * Write tool use - shows file path being written
 */
function WriteToolUse({ input }: { input: WriteInput }) {
  const fileName = getFileName(input.file_path);
  const lineCount = input.content.split("\n").length;
  return (
    <div className="write-tool-use">
      <span className="file-path">{fileName}</span>
      <span className="write-info">{lineCount} lines</span>
    </div>
  );
}

/**
 * Modal content for viewing full file contents
 */
function WriteModalContent({
  file,
  input,
}: {
  file: WriteResult["file"];
  input?: WriteInputWithAugment;
}) {
  const lines = file.content.split("\n");

  // Use highlighted HTML if available from input augment
  if (input?._highlightedContentHtml) {
    return (
      <div className="file-content-modal">
        <div className="file-viewer-code file-viewer-code-highlighted">
          <div
            className="shiki-container"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered HTML
            dangerouslySetInnerHTML={{ __html: input._highlightedContentHtml }}
          />
          {input._highlightedTruncated && (
            <div className="file-viewer-truncated">
              Content truncated for highlighting (showing first 2000 lines)
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback: plain text with line numbers
  return (
    <div className="file-content-modal">
      <div className="file-content-with-lines">
        <div className="line-numbers">
          {lines.map((_, i) => (
            <div key={`ln-${i + 1}`}>{file.startLine + i}</div>
          ))}
        </div>
        <pre className="line-content">
          <code>{file.content}</code>
        </pre>
      </div>
    </div>
  );
}

/**
 * Write tool result - shows written content with line numbers
 * Uses highlighted HTML from input augment when available.
 */
function WriteToolResult({
  result,
  isError,
  input,
}: {
  result: WriteResult;
  isError: boolean;
  input?: WriteInputWithAugment;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { enabled, reportValidationError, isToolIgnored } =
    useSchemaValidationContext();
  const [validationErrors, setValidationErrors] = useState<ZodError | null>(
    null,
  );

  useEffect(() => {
    if (enabled && result) {
      const validation = validateToolResult("Write", result);
      if (!validation.valid && validation.errors) {
        setValidationErrors(validation.errors);
        reportValidationError("Write", validation.errors);
      } else {
        setValidationErrors(null);
      }
    }
  }, [enabled, result, reportValidationError]);

  const showValidationWarning =
    enabled && validationErrors && !isToolIgnored("Write");

  if (isError || !result?.file) {
    // Extract error message - can be a string or object with content
    let errorMessage = "Failed to write file";
    if (typeof result === "string") {
      errorMessage = result;
    } else if (typeof result === "object" && result !== null) {
      const errorResult = result as { content?: unknown };
      if (errorResult.content) {
        errorMessage = String(errorResult.content);
      }
    }
    return (
      <div className="write-error">
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="Write" errors={validationErrors} />
        )}
        {errorMessage}
      </div>
    );
  }

  const { file } = result;
  const lines = file.content.split("\n");
  const needsCollapse = lines.length > MAX_LINES_COLLAPSED;
  const fileName = getFileName(file.filePath);

  // Use highlighted HTML if available from input augment
  if (input?._highlightedContentHtml) {
    return (
      <div className="write-result">
        <div className="file-header">
          <span className="file-path">{fileName}</span>
          <span className="file-range">{file.numLines} lines written</span>
          {showValidationWarning && validationErrors && (
            <SchemaWarning toolName="Write" errors={validationErrors} />
          )}
        </div>
        <div className="file-viewer-code file-viewer-code-highlighted">
          <div
            className="shiki-container"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered HTML
            dangerouslySetInnerHTML={{ __html: input._highlightedContentHtml }}
          />
          {input._highlightedTruncated && (
            <div className="file-viewer-truncated">
              Content truncated for highlighting (showing first 2000 lines)
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback: plain text with line numbers and expand/collapse
  const displayLines =
    needsCollapse && !isExpanded ? lines.slice(0, MAX_LINES_COLLAPSED) : lines;

  return (
    <div className="write-result">
      <div className="file-header">
        <span className="file-path">{fileName}</span>
        <span className="file-range">{file.numLines} lines written</span>
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="Write" errors={validationErrors} />
        )}
      </div>
      <div className="file-content-with-lines">
        <div className="line-numbers">
          {displayLines.map((_, i) => {
            const lineNum = file.startLine + i;
            return <div key={`line-${lineNum}`}>{lineNum}</div>;
          })}
          {needsCollapse && !isExpanded && <div>...</div>}
        </div>
        <pre className="line-content">
          <code>{displayLines.join("\n")}</code>
        </pre>
      </div>
      {needsCollapse && (
        <button
          type="button"
          className="expand-button"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "Show less" : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

/**
 * Collapsed preview showing line count and code preview with fade
 * Clicking opens a modal with the full content
 */
function WriteCollapsedPreview({
  input,
  result,
  isError,
}: {
  input: WriteInputWithAugment;
  result: WriteResult | undefined;
  isError: boolean;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { enabled, reportValidationError, isToolIgnored } =
    useSchemaValidationContext();
  const [validationErrors, setValidationErrors] = useState<ZodError | null>(
    null,
  );

  useEffect(() => {
    if (enabled && result) {
      const validation = validateToolResult("Write", result);
      if (!validation.valid && validation.errors) {
        setValidationErrors(validation.errors);
        reportValidationError("Write", validation.errors);
      } else {
        setValidationErrors(null);
      }
    }
  }, [enabled, result, reportValidationError]);

  const showValidationWarning =
    enabled && validationErrors && !isToolIgnored("Write");

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isError) {
        setIsModalOpen(true);
      }
    },
    [isError],
  );

  const handleClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // Use result data if available, otherwise fall back to input
  const content = result?.file?.content ?? input.content;
  const filePath = result?.file?.filePath ?? input.file_path;
  const fileName = getFileName(filePath);
  const lines = content.split("\n");
  const lineCount = result?.file?.numLines ?? lines.length;
  const previewLines = lines.slice(0, PREVIEW_LINES);
  const isTruncated = lines.length > PREVIEW_LINES;

  if (isError) {
    // Extract error message from result - can be a string or object with content
    let errorMessage = "Failed to write file";
    if (typeof result === "string") {
      errorMessage = result;
    } else if (typeof result === "object" && result !== null) {
      const errorResult = result as { content?: unknown };
      if (errorResult.content) {
        errorMessage = String(errorResult.content);
      }
    }
    return (
      <div className="write-collapsed-preview write-collapsed-error">
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="Write" errors={validationErrors} />
        )}
        <span className="write-preview-error">{errorMessage}</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="write-collapsed-preview"
        onClick={handleClick}
      >
        <div className="write-preview-lines">
          {lineCount} lines
          {showValidationWarning && validationErrors && (
            <SchemaWarning toolName="Write" errors={validationErrors} />
          )}
        </div>
        <div
          className={`write-preview-content ${isTruncated ? "write-preview-truncated" : ""}`}
        >
          <pre>
            <code>{previewLines.join("\n")}</code>
          </pre>
          {isTruncated && <div className="write-preview-fade" />}
        </div>
      </button>
      {isModalOpen && (
        <Modal
          title={<span className="file-path">{fileName}</span>}
          onClose={handleClose}
        >
          <WriteModalContent
            file={
              result?.file ?? {
                filePath,
                content,
                numLines: lineCount,
                startLine: 1,
                totalLines: lineCount,
              }
            }
            input={input}
          />
        </Modal>
      )}
    </>
  );
}

export const writeRenderer: ToolRenderer<WriteInput, WriteResult> = {
  tool: "Write",

  renderToolUse(input, _context) {
    return <WriteToolUse input={input as WriteInput} />;
  },

  renderToolResult(result, isError, _context, input) {
    return (
      <WriteToolResult
        result={result as WriteResult}
        isError={isError}
        input={input as WriteInputWithAugment | undefined}
      />
    );
  },

  getUseSummary(input) {
    return getFileName((input as WriteInput).file_path);
  },

  getResultSummary(result, isError, input?) {
    if (isError) return "Error";
    const r = result as WriteResult;
    if (r?.file) {
      return getFileName(r.file.filePath);
    }
    // Fall back to input if result not ready
    if (input) {
      return getFileName((input as WriteInput).file_path);
    }
    return "Writing...";
  },

  renderCollapsedPreview(input, result, isError, _context) {
    return (
      <WriteCollapsedPreview
        input={input as WriteInputWithAugment}
        result={result as WriteResult | undefined}
        isError={isError}
      />
    );
  },
};
