import { useEffect, useState } from "react";
import type { ZodError } from "zod";
import { useSchemaValidationContext } from "../../../contexts/SchemaValidationContext";
import { validateToolResult } from "../../../lib/validateToolResult";
import { SchemaWarning } from "../../SchemaWarning";
import type { ToolRenderer, WebFetchInput, WebFetchResult } from "./types";

const MAX_CONTENT_LINES = 30;

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * WebFetch tool use - shows URL and prompt
 */
function WebFetchToolUse({ input }: { input: WebFetchInput }) {
  return (
    <div className="webfetch-tool-use">
      <a
        href={input.url}
        target="_blank"
        rel="noopener noreferrer"
        className="webfetch-url"
      >
        {input.url}
      </a>
      {input.prompt && <div className="webfetch-prompt">{input.prompt}</div>}
    </div>
  );
}

/**
 * WebFetch tool result - shows fetched content
 */
function WebFetchToolResult({
  result,
  isError,
}: {
  result: WebFetchResult;
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
      const validation = validateToolResult("WebFetch", result);
      if (!validation.valid && validation.errors) {
        setValidationErrors(validation.errors);
        reportValidationError("WebFetch", validation.errors);
      } else {
        setValidationErrors(null);
      }
    }
  }, [enabled, result, reportValidationError]);

  const showValidationWarning =
    enabled && validationErrors && !isToolIgnored("WebFetch");

  if (isError) {
    const errorResult = result as unknown as { content?: unknown } | undefined;
    return (
      <div className="webfetch-error">
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="WebFetch" errors={validationErrors} />
        )}
        {typeof result === "object" && errorResult?.content
          ? String(errorResult.content)
          : "Fetch failed"}
      </div>
    );
  }

  if (!result) {
    return <div className="webfetch-empty">No content</div>;
  }

  const lines = result.result?.split("\n") || [];
  const needsCollapse = lines.length > MAX_CONTENT_LINES;
  const displayLines =
    needsCollapse && !isExpanded ? lines.slice(0, MAX_CONTENT_LINES) : lines;

  const statusClass =
    result.code >= 200 && result.code < 300
      ? "badge-success"
      : result.code >= 400
        ? "badge-error"
        : "badge-warning";

  return (
    <div className="webfetch-result">
      <div className="webfetch-header">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="webfetch-url"
        >
          {result.url}
        </a>
        <span className={`badge ${statusClass}`}>
          {result.code} {result.codeText}
        </span>
        <span className="webfetch-meta">
          {formatBytes(result.bytes)} &middot; {result.durationMs}ms
        </span>
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="WebFetch" errors={validationErrors} />
        )}
      </div>
      {result.result && (
        <>
          <pre className="webfetch-content code-block">
            <code>{displayLines.join("\n")}</code>
          </pre>
          {needsCollapse && (
            <button
              type="button"
              className="expand-button"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? "Show less" : `Show all ${lines.length} lines`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export const webFetchRenderer: ToolRenderer<WebFetchInput, WebFetchResult> = {
  tool: "WebFetch",

  renderToolUse(input, _context) {
    return <WebFetchToolUse input={input as WebFetchInput} />;
  },

  renderToolResult(result, isError, _context) {
    return (
      <WebFetchToolResult result={result as WebFetchResult} isError={isError} />
    );
  },

  getUseSummary(input) {
    const url = (input as WebFetchInput).url;
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  },

  getResultSummary(result, isError) {
    if (isError) return "Error";
    const r = result as WebFetchResult;
    return r?.code ? `${r.code} ${r.codeText}` : "Fetched";
  },
};
