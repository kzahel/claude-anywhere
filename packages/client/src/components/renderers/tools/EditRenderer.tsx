import { useCallback, useEffect, useMemo, useState } from "react";
import type { ZodError } from "zod";
import { useSchemaValidationContext } from "../../../contexts/SchemaValidationContext";
import { validateToolResult } from "../../../lib/validateToolResult";
import { SchemaWarning } from "../../SchemaWarning";
import { Modal } from "../../ui/Modal";
import type { EditInput, EditResult, PatchHunk, ToolRenderer } from "./types";

const MAX_VISIBLE_LINES = 12;

/** Extended input type with embedded augment data from server */
interface EditInputWithAugment extends EditInput {
  _structuredPatch?: PatchHunk[];
  _diffHtml?: string;
}

/**
 * Extract filename from path
 */
function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

/**
 * Check if this is a Claude plan file
 */
function isPlanFile(filePath: string): boolean {
  return filePath.includes(".claude/plans/");
}

/**
 * Compute change summary from structuredPatch
 */
function computeChangeSummary(structuredPatch: PatchHunk[]): string | null {
  if (!structuredPatch || structuredPatch.length === 0) return null;

  const additions = structuredPatch
    .flatMap((h) => h.lines)
    .filter((l) => l.startsWith("+")).length;
  const deletions = structuredPatch
    .flatMap((h) => h.lines)
    .filter((l) => l.startsWith("-")).length;

  if (additions > 0 && deletions > 0) {
    return `Modified ${additions + deletions} lines`;
  }
  if (additions > 0) {
    return `Added ${additions} line${additions !== 1 ? "s" : ""}`;
  }
  if (deletions > 0) {
    return `Removed ${deletions} line${deletions !== 1 ? "s" : ""}`;
  }
  return null;
}

/**
 * Render diff lines (shared between pending preview and result fallback)
 */
function DiffLines({ lines }: { lines: string[] }) {
  return (
    <div className="diff-hunk">
      <pre className="diff-content">
        {lines.map((line, i) => {
          const prefix = line[0];
          const className =
            prefix === "-"
              ? "diff-removed"
              : prefix === "+"
                ? "diff-added"
                : "diff-context";
          // Use line content hash for stable keys
          const key = `${i}-${line.slice(0, 50)}`;
          return (
            <div key={key} className={className}>
              {line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

/**
 * Render pre-highlighted diff HTML from shiki.
 * Used when diffHtml is available from the augment.
 */
function HighlightedDiff({
  diffHtml,
  truncateLines,
}: {
  diffHtml: string;
  truncateLines?: number;
}) {
  // If truncation is needed, we need to limit the visible lines
  // The HTML is wrapped in <pre class="shiki"><code>...</code></pre>
  // Each line is a <span class="line">...</span>
  const htmlToRender = useMemo(() => {
    if (!truncateLines) return diffHtml;

    // Parse and truncate by counting line spans
    // Simple approach: find closing </code> and count lines before it
    const lines = diffHtml.split('<span class="line">');
    if (lines.length <= truncateLines + 1) return diffHtml;

    // Rebuild with only truncateLines worth of lines
    const truncated = lines
      .slice(0, truncateLines + 1)
      .join('<span class="line">');
    // Close any open tags
    return `${truncated}</code></pre>`;
  }, [diffHtml, truncateLines]);

  return (
    <div
      className="highlighted-diff"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is safe
      dangerouslySetInnerHTML={{ __html: htmlToRender }}
    />
  );
}

/**
 * Render a single diff hunk (without @@ header for cleaner display)
 */
function DiffHunk({ hunk }: { hunk: PatchHunk }) {
  return (
    <div className="diff-hunk">
      <pre className="diff-content">
        {hunk.lines.map((line, i) => {
          const prefix = line[0];
          const className =
            prefix === "-"
              ? "diff-removed"
              : prefix === "+"
                ? "diff-added"
                : "diff-context";
          return (
            <div key={`${hunk.oldStart}-${i}`} className={className}>
              {line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

/**
 * Edit tool use - shows file path and diff preview
 * Reads augment data directly from input._structuredPatch and input._diffHtml.
 */
function EditToolUse({ input }: { input: EditInputWithAugment }) {
  const fileName = getFileName(input.file_path);
  const isPlan = isPlanFile(input.file_path);

  // Show loading state if augment data not yet available
  if (!input._structuredPatch || input._structuredPatch.length === 0) {
    return (
      <div className="edit-result">
        <div className="edit-header">
          <span className="file-path">{fileName}</span>
          {isPlan && <span className="badge badge-muted">Plan</span>}
        </div>
        <div className="edit-loading">Computing diff...</div>
      </div>
    );
  }

  const diffLines = input._structuredPatch.flatMap((hunk) => hunk.lines);
  const changeSummary = computeChangeSummary(input._structuredPatch);
  const isTruncated = diffLines.length > MAX_VISIBLE_LINES;

  return (
    <div className="edit-result">
      <div className="edit-header">
        <span className="file-path">{fileName}</span>
        {isPlan && <span className="badge badge-muted">Plan</span>}
      </div>
      {changeSummary && (
        <div className="edit-change-summary">{changeSummary}</div>
      )}
      <div className={`diff-view-container ${isTruncated ? "truncated" : ""}`}>
        <div className="diff-view">
          {input._diffHtml ? (
            <HighlightedDiff
              diffHtml={input._diffHtml}
              truncateLines={isTruncated ? MAX_VISIBLE_LINES : undefined}
            />
          ) : (
            <DiffLines lines={diffLines} />
          )}
        </div>
        {isTruncated && <div className="diff-fade-overlay" />}
      </div>
    </div>
  );
}

/**
 * Modal content for viewing complete diff
 */
function DiffModalContent({
  diffHtml,
  structuredPatch,
}: {
  diffHtml?: string;
  structuredPatch: PatchHunk[];
}) {
  // Prefer pre-highlighted HTML from server
  if (diffHtml) {
    return (
      <div className="diff-modal-content">
        <HighlightedDiff diffHtml={diffHtml} />
      </div>
    );
  }

  // Fallback: combine all hunks (plain text)
  const diffText = structuredPatch
    .map((hunk) => hunk.lines.join("\n"))
    .join("\n");

  return (
    <div className="diff-modal-content">
      <DiffLines lines={diffText.split("\n")} />
    </div>
  );
}

/**
 * Collapsed preview showing diff with expand button
 * Clicking opens a modal with the full diff.
 * Reads augment data directly from input._structuredPatch and input._diffHtml.
 */
function EditCollapsedPreview({
  input,
  result,
  isError,
}: {
  input: EditInputWithAugment;
  result: EditResult | undefined;
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
      const validation = validateToolResult("Edit", result);
      if (!validation.valid && validation.errors) {
        setValidationErrors(validation.errors);
        reportValidationError("Edit", validation.errors);
      } else {
        setValidationErrors(null);
      }
    }
  }, [enabled, result, reportValidationError]);

  const showValidationWarning =
    enabled && validationErrors && !isToolIgnored("Edit");

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

  // Use result data if available, fall back to input
  const filePath = result?.filePath ?? input.file_path;
  const fileName = getFileName(filePath);
  const isPlan = isPlanFile(filePath);

  // Get structuredPatch - prefer result, then input augment
  const structuredPatch =
    result?.structuredPatch ?? input._structuredPatch ?? [];

  // Get diffHtml from input augment (only used for tool_use display)
  const diffHtml = input._diffHtml;

  if (isError) {
    // Extract error message - can be a string or object with content
    let errorMessage: string | null = null;
    if (typeof result === "string") {
      errorMessage = result;
    } else if (typeof result === "object" && result !== null) {
      const errorResult = result as { content?: unknown };
      if (errorResult.content) {
        errorMessage = String(errorResult.content);
      }
    }
    return (
      <div className="edit-collapsed-preview edit-collapsed-error">
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="Edit" errors={validationErrors} />
        )}
        <span className="badge badge-error">Edit failed</span>
        {errorMessage && (
          <span className="edit-error-message">{errorMessage}</span>
        )}
      </div>
    );
  }

  // Require structuredPatch - show loading if not available
  if (structuredPatch.length === 0) {
    return (
      <div className="edit-collapsed-preview">
        <div className="edit-header">
          <span className="file-path">{fileName}</span>
          {isPlan && <span className="badge badge-muted">Plan</span>}
        </div>
        <div className="edit-loading">Computing diff...</div>
      </div>
    );
  }

  const diffLines = structuredPatch.flatMap((hunk) => hunk.lines);
  const isTruncated = diffLines.length > MAX_VISIBLE_LINES;
  const changeSummary = computeChangeSummary(structuredPatch);

  return (
    <>
      <div className="edit-collapsed-preview">
        <div className="edit-header">
          <span className="file-path">{fileName}</span>
          {isPlan && <span className="badge badge-muted">Plan</span>}
          {result?.userModified && (
            <span className="badge badge-info">User modified</span>
          )}
          {showValidationWarning && validationErrors && (
            <SchemaWarning toolName="Edit" errors={validationErrors} />
          )}
        </div>
        {changeSummary && (
          <div className="edit-change-summary">{changeSummary}</div>
        )}
        <div
          className={`diff-view-container ${isTruncated ? "truncated" : ""}`}
        >
          <div className="diff-view">
            {diffHtml ? (
              <HighlightedDiff
                diffHtml={diffHtml}
                truncateLines={isTruncated ? MAX_VISIBLE_LINES : undefined}
              />
            ) : (
              <DiffLines lines={diffLines} />
            )}
          </div>
          {isTruncated && <div className="diff-fade-overlay" />}
        </div>
        <button
          type="button"
          className="diff-expand-button"
          onClick={handleClick}
        >
          Show full diff
        </button>
      </div>
      {isModalOpen && (
        <Modal
          title={<span className="file-path">{fileName}</span>}
          onClose={handleClose}
        >
          <DiffModalContent
            diffHtml={diffHtml}
            structuredPatch={structuredPatch}
          />
        </Modal>
      )}
    </>
  );
}

/**
 * Edit tool result - shows diff view with truncation and modal expand
 */
function EditToolResult({
  result,
  input,
  isError,
}: {
  result: EditResult;
  input?: EditInput;
  isError: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  const { enabled, reportValidationError, isToolIgnored } =
    useSchemaValidationContext();
  const [validationErrors, setValidationErrors] = useState<ZodError | null>(
    null,
  );

  useEffect(() => {
    if (enabled && result) {
      const validation = validateToolResult("Edit", result);
      if (!validation.valid && validation.errors) {
        setValidationErrors(validation.errors);
        reportValidationError("Edit", validation.errors);
      } else {
        setValidationErrors(null);
      }
    }
  }, [enabled, result, reportValidationError]);

  const showValidationWarning =
    enabled && validationErrors && !isToolIgnored("Edit");

  // Count total lines in all hunks
  const totalLines = useMemo(() => {
    if (!result?.structuredPatch) return 0;
    return result.structuredPatch.reduce(
      (sum, hunk) => sum + hunk.lines.length + 1, // +1 for hunk header
      0,
    );
  }, [result?.structuredPatch]);

  const isTruncated = totalLines > MAX_VISIBLE_LINES;

  // Compute change summary
  const changeSummary = useMemo(() => {
    if (!result?.structuredPatch) return null;
    const additions = result.structuredPatch
      .flatMap((h) => h.lines)
      .filter((l) => l.startsWith("+")).length;
    const deletions = result.structuredPatch
      .flatMap((h) => h.lines)
      .filter((l) => l.startsWith("-")).length;

    if (additions > 0 && deletions > 0) {
      return `Modified ${additions + deletions} lines`;
    }
    if (additions > 0) {
      return `Added ${additions} line${additions !== 1 ? "s" : ""}`;
    }
    if (deletions > 0) {
      return `Removed ${deletions} line${deletions !== 1 ? "s" : ""}`;
    }
    return null;
  }, [result?.structuredPatch]);

  if (isError) {
    // Extract error message - can be a string or object with content
    let errorMessage: string | null = null;
    if (typeof result === "string") {
      errorMessage = result;
    } else if (typeof result === "object" && result !== null) {
      const errorResult = result as { content?: unknown };
      if (errorResult.content) {
        errorMessage = String(errorResult.content);
      }
    }
    return (
      <div className="edit-result edit-result-error">
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="Edit" errors={validationErrors} />
        )}
        <span className="badge badge-error">Edit failed</span>
        {errorMessage && (
          <div className="edit-error-message">{errorMessage}</div>
        )}
      </div>
    );
  }

  // Handle case where result doesn't have structuredPatch
  // Use input data as fallback when result data is missing
  if (!result?.structuredPatch || result.structuredPatch.length === 0) {
    const filePath = result?.filePath || input?.file_path;
    const oldString = result?.oldString || input?.old_string || "";
    const newString = result?.newString || input?.new_string || "";
    const isPlan = filePath ? isPlanFile(filePath) : false;

    return (
      <div className="edit-result">
        <div className="edit-header">
          <span className="file-path">
            {filePath ? getFileName(filePath) : "File"}
          </span>
          {isPlan && <span className="badge badge-muted">Plan</span>}
          {result?.userModified && (
            <span className="badge badge-info">User modified</span>
          )}
          {showValidationWarning && validationErrors && (
            <SchemaWarning toolName="Edit" errors={validationErrors} />
          )}
        </div>
        <div className="edit-simple">
          <div className="edit-old">
            <div className="edit-label">Removed:</div>
            <pre className="code-block">
              <code>{oldString || "(empty)"}</code>
            </pre>
          </div>
          <div className="edit-new">
            <div className="edit-label">Added:</div>
            <pre className="code-block">
              <code>{newString || "(empty)"}</code>
            </pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="edit-result">
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="Edit" errors={validationErrors} />
        )}
        {changeSummary && (
          <div className="edit-change-summary">{changeSummary}</div>
        )}
        {result.userModified && (
          <span className="badge badge-info">User modified</span>
        )}
        <div
          className={`diff-view-container ${isTruncated ? "truncated" : ""}`}
        >
          <div className="diff-view">
            {result.structuredPatch.map((hunk, i) => (
              <DiffHunk key={`hunk-${hunk.oldStart}-${i}`} hunk={hunk} />
            ))}
          </div>
          {isTruncated && (
            <>
              <div className="diff-fade-overlay" />
              <button
                type="button"
                className="diff-expand-button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowModal(true);
                }}
              >
                Click to expand
              </button>
            </>
          )}
        </div>
      </div>
      {showModal && (
        <Modal
          title={
            <span className="file-path">{getFileName(result.filePath)}</span>
          }
          onClose={() => setShowModal(false)}
        >
          <DiffModalContent structuredPatch={result.structuredPatch} />
        </Modal>
      )}
    </>
  );
}

export const editRenderer: ToolRenderer<EditInput, EditResult> = {
  tool: "Edit",

  renderToolUse(input) {
    return <EditToolUse input={input as EditInputWithAugment} />;
  },

  renderToolResult(result, isError, _context, input) {
    return (
      <EditToolResult
        result={result as EditResult}
        input={input as EditInput | undefined}
        isError={isError}
      />
    );
  },

  getUseSummary(input) {
    return getFileName((input as EditInput).file_path);
  },

  getResultSummary(result, isError) {
    if (isError) return "Failed";
    const r = result as EditResult;
    return r?.filePath ? getFileName(r.filePath) : "file";
  },

  renderCollapsedPreview(input, result, isError) {
    return (
      <EditCollapsedPreview
        input={input as EditInputWithAugment}
        result={result as EditResult | undefined}
        isError={isError}
      />
    );
  },
};
