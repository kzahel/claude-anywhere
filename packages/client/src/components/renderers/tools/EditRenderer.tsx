import type { RenderContext } from "../types";
import type { EditInput, EditResult, PatchHunk, ToolRenderer } from "./types";

/**
 * Extract filename from path
 */
function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

/**
 * Render a single diff hunk
 */
function DiffHunk({ hunk }: { hunk: PatchHunk }) {
  return (
    <div className="diff-hunk">
      <div className="diff-hunk-header">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </div>
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
 * Edit tool use - shows file path being edited
 */
function EditToolUse({ input }: { input: EditInput }) {
  const fileName = getFileName(input.file_path);
  return (
    <div className="edit-tool-use">
      <span className="file-path">{fileName}</span>
      <span className="edit-action">Editing file...</span>
    </div>
  );
}

/**
 * Edit tool result - shows diff view
 */
function EditToolResult({
  result,
  isError,
}: {
  result: EditResult;
  isError: boolean;
}) {
  if (isError) {
    const errorResult = result as unknown as { content?: unknown } | undefined;
    const hasContent = typeof result === "object" && errorResult?.content;
    return (
      <div className="edit-result edit-result-error">
        <span className="badge badge-error">Edit failed</span>
        {hasContent ? (
          <div className="edit-error-message">
            {String(errorResult.content)}
          </div>
        ) : null}
      </div>
    );
  }

  // Handle case where result doesn't have structuredPatch
  if (!result?.structuredPatch || result.structuredPatch.length === 0) {
    return (
      <div className="edit-result">
        <div className="edit-header">
          <span className="file-path">
            {result?.filePath ? getFileName(result.filePath) : "File"}
          </span>
          {result?.userModified && (
            <span className="badge badge-info">User modified</span>
          )}
        </div>
        <div className="edit-simple">
          <div className="edit-old">
            <div className="edit-label">Removed:</div>
            <pre className="code-block">
              <code>{result?.oldString || "(empty)"}</code>
            </pre>
          </div>
          <div className="edit-new">
            <div className="edit-label">Added:</div>
            <pre className="code-block">
              <code>{result?.newString || "(empty)"}</code>
            </pre>
          </div>
        </div>
      </div>
    );
  }

  const fileName = getFileName(result.filePath);

  return (
    <div className="edit-result">
      <div className="edit-header">
        <span className="file-path">{fileName}</span>
        {result.userModified && (
          <span className="badge badge-info">User modified</span>
        )}
      </div>
      <div className="diff-view">
        {result.structuredPatch.map((hunk, i) => (
          <DiffHunk key={`hunk-${hunk.oldStart}-${i}`} hunk={hunk} />
        ))}
      </div>
    </div>
  );
}

export const editRenderer: ToolRenderer<EditInput, EditResult> = {
  tool: "Edit",

  renderToolUse(input, _context) {
    return <EditToolUse input={input as EditInput} />;
  },

  renderToolResult(result, isError, _context) {
    return <EditToolResult result={result as EditResult} isError={isError} />;
  },

  getUseSummary(input) {
    return getFileName((input as EditInput).file_path);
  },

  getResultSummary(result, isError) {
    if (isError) return "Failed";
    const r = result as EditResult;
    const fileName = r?.filePath ? getFileName(r.filePath) : "file";
    if (!r?.structuredPatch) return fileName;
    const additions = r.structuredPatch
      .flatMap((h) => h.lines)
      .filter((l) => l.startsWith("+")).length;
    const deletions = r.structuredPatch
      .flatMap((h) => h.lines)
      .filter((l) => l.startsWith("-")).length;
    return `${fileName} (+${additions} -${deletions})`;
  },
};
