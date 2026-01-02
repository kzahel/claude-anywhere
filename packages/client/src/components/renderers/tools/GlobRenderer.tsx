import { useEffect, useState } from "react";
import type { ZodError } from "zod";
import { useSchemaValidationContext } from "../../../contexts/SchemaValidationContext";
import { validateToolResult } from "../../../lib/validateToolResult";
import { SchemaWarning } from "../../SchemaWarning";
import type { GlobInput, GlobResult, ToolRenderer } from "./types";

const MAX_FILES_COLLAPSED = 20;

/**
 * Extract filename from path
 */
function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

/**
 * Glob tool use - shows pattern being searched
 */
function GlobToolUse({ input }: { input: GlobInput }) {
  return (
    <div className="glob-tool-use">
      <span className="glob-pattern">{input.pattern}</span>
      {input.path && <span className="glob-path">in {input.path}</span>}
    </div>
  );
}

/**
 * Glob tool result - shows list of matching files
 */
function GlobToolResult({
  result,
  isError,
}: {
  result: GlobResult;
  isError: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { enabled, reportValidationError, isToolIgnored } =
    useSchemaValidationContext();
  const [validationErrors, setValidationErrors] = useState<ZodError | null>(
    null,
  );

  useEffect(() => {
    if (enabled && result) {
      const validation = validateToolResult("Glob", result);
      if (!validation.valid && validation.errors) {
        setValidationErrors(validation.errors);
        reportValidationError("Glob", validation.errors);
      } else {
        setValidationErrors(null);
      }
    }
  }, [enabled, result, reportValidationError]);

  const showValidationWarning =
    enabled && validationErrors && !isToolIgnored("Glob");

  if (isError) {
    const errorResult = result as unknown as { content?: unknown } | undefined;
    return (
      <div className="glob-error">
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="Glob" errors={validationErrors} />
        )}
        {typeof result === "object" && errorResult?.content
          ? String(errorResult.content)
          : "Glob search failed"}
      </div>
    );
  }

  if (!result?.filenames || result.filenames.length === 0) {
    return (
      <div className="glob-empty">
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="Glob" errors={validationErrors} />
        )}
        No files found
      </div>
    );
  }

  const { filenames, numFiles, truncated } = result;
  const needsCollapse = filenames.length > MAX_FILES_COLLAPSED;
  const displayFiles =
    needsCollapse && !isExpanded
      ? filenames.slice(0, MAX_FILES_COLLAPSED)
      : filenames;

  return (
    <div className="glob-result">
      <div className="glob-header">
        <span className="glob-count">{numFiles} files</span>
        {truncated && <span className="badge badge-warning">truncated</span>}
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="Glob" errors={validationErrors} />
        )}
      </div>
      <div className="file-list">
        {displayFiles.map((file) => (
          <div key={file} className="file-list-item">
            <span className="file-path">{getFileName(file)}</span>
            <span className="file-dir">{file}</span>
          </div>
        ))}
        {needsCollapse && !isExpanded && (
          <div className="file-list-more">
            ... and {filenames.length - MAX_FILES_COLLAPSED} more
          </div>
        )}
      </div>
      {needsCollapse && (
        <button
          type="button"
          className="expand-button"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "Show less" : `Show all ${filenames.length} files`}
        </button>
      )}
    </div>
  );
}

export const globRenderer: ToolRenderer<GlobInput, GlobResult> = {
  tool: "Glob",

  renderToolUse(input, _context) {
    return <GlobToolUse input={input as GlobInput} />;
  },

  renderToolResult(result, isError, _context) {
    return <GlobToolResult result={result as GlobResult} isError={isError} />;
  },

  getUseSummary(input) {
    return `pattern: "${(input as GlobInput).pattern}"`;
  },

  getResultSummary(result, isError) {
    if (isError) return "Error";
    const r = result as GlobResult;
    if (r?.numFiles === undefined) return "Searching...";
    if (r.numFiles === 0) return "No files found";
    return `Found ${r.numFiles} files`;
  },
};
