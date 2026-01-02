import { useEffect, useState } from "react";
import type { ZodError } from "zod";
import { useSchemaValidationContext } from "../../../contexts/SchemaValidationContext";
import { validateToolResult } from "../../../lib/validateToolResult";
import { SchemaWarning } from "../../SchemaWarning";
import type { BashOutputInput, BashOutputResult, ToolRenderer } from "./types";

const MAX_LINES_COLLAPSED = 20;

/**
 * Format timestamp to relative time
 */
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    return date.toLocaleTimeString();
  } catch {
    return timestamp;
  }
}

/**
 * Status indicator component
 */
function StatusIndicator({ status }: { status: string }) {
  const statusConfig = {
    running: { icon: "⟳", className: "status-running" },
    completed: { icon: "✓", className: "status-completed" },
    failed: { icon: "✗", className: "status-failed" },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || {
    icon: "?",
    className: "",
  };

  return (
    <span className={`bashoutput-status ${config.className}`}>
      {config.icon} {status}
    </span>
  );
}

/**
 * BashOutput tool use - shows bash_id being polled
 */
function BashOutputToolUse({ input }: { input: BashOutputInput }) {
  return (
    <div className="bashoutput-tool-use">
      <span className="bashoutput-label">Polling background shell</span>
      <code className="bashoutput-id">{input.bash_id}</code>
      {input.block !== undefined && (
        <span className="badge">
          {input.block ? "blocking" : "non-blocking"}
        </span>
      )}
    </div>
  );
}

/**
 * BashOutput tool result - shows async bash result
 */
function BashOutputToolResult({
  result,
  isError,
}: {
  result: BashOutputResult;
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
      const validation = validateToolResult("BashOutput", result);
      if (!validation.valid && validation.errors) {
        setValidationErrors(validation.errors);
        reportValidationError("BashOutput", validation.errors);
      } else {
        setValidationErrors(null);
      }
    }
  }, [enabled, result, reportValidationError]);

  const showValidationWarning =
    enabled && validationErrors && !isToolIgnored("BashOutput");

  if (isError) {
    const errorResult = result as unknown as { content?: unknown } | undefined;
    return (
      <div className="bashoutput-error">
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="BashOutput" errors={validationErrors} />
        )}
        {typeof result === "object" && errorResult?.content
          ? String(errorResult.content)
          : "Failed to get bash output"}
      </div>
    );
  }

  if (!result) {
    return <div className="bashoutput-empty">No output</div>;
  }

  const stdoutLines = result.stdout?.split("\n") || [];
  const stderrLines = result.stderr?.split("\n") || [];
  const totalLines = stdoutLines.length + stderrLines.length;
  const needsCollapse = totalLines > MAX_LINES_COLLAPSED;

  const displayStdout =
    needsCollapse && !isExpanded
      ? stdoutLines.slice(0, MAX_LINES_COLLAPSED)
      : stdoutLines;

  return (
    <div className="bashoutput-result">
      <div className="bashoutput-header">
        <StatusIndicator status={result.status} />
        {result.command && (
          <code className="bashoutput-command">{result.command}</code>
        )}
        {result.exitCode !== null && (
          <span
            className={`badge ${result.exitCode === 0 ? "badge-success" : "badge-error"}`}
          >
            exit {result.exitCode}
          </span>
        )}
        {result.timestamp && (
          <span className="bashoutput-timestamp">
            {formatTimestamp(result.timestamp)}
          </span>
        )}
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="BashOutput" errors={validationErrors} />
        )}
      </div>
      {(result.stdout || result.stderr) && (
        <>
          {result.stdout && (
            <pre className="bash-stdout code-block">
              <code>{displayStdout.join("\n")}</code>
            </pre>
          )}
          {result.stderr && (
            <pre className="bash-stderr code-block">
              <code>{result.stderr}</code>
            </pre>
          )}
          {needsCollapse && (
            <button
              type="button"
              className="expand-button"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? "Show less" : `Show all ${totalLines} lines`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export const bashOutputRenderer: ToolRenderer<
  BashOutputInput,
  BashOutputResult
> = {
  tool: "BashOutput",

  renderToolUse(input, _context) {
    return <BashOutputToolUse input={input as BashOutputInput} />;
  },

  renderToolResult(result, isError, _context) {
    return (
      <BashOutputToolResult
        result={result as BashOutputResult}
        isError={isError}
      />
    );
  },

  getUseSummary(input) {
    return (input as BashOutputInput).bash_id;
  },

  getResultSummary(result, isError) {
    if (isError) return "Error";
    const r = result as BashOutputResult;
    if (!r) return "Pending";
    if (r.status === "running") return "Running...";
    if (r.exitCode !== null) return `exit ${r.exitCode}`;
    return r.status;
  },
};
