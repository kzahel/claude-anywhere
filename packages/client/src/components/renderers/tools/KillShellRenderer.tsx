import { useEffect, useState } from "react";
import type { ZodError } from "zod";
import { useSchemaValidationContext } from "../../../contexts/SchemaValidationContext";
import { validateToolResult } from "../../../lib/validateToolResult";
import { SchemaWarning } from "../../SchemaWarning";
import type { KillShellInput, KillShellResult, ToolRenderer } from "./types";

/**
 * KillShell tool use - shows shell_id being killed
 */
function KillShellToolUse({ input }: { input: KillShellInput }) {
  return (
    <div className="killshell-tool-use">
      <span className="killshell-label">Killing shell</span>
      <code className="killshell-id">{input.shell_id}</code>
    </div>
  );
}

/**
 * KillShell tool result - shows confirmation message
 */
function KillShellToolResult({
  result,
  isError,
}: {
  result: KillShellResult;
  isError: boolean;
}) {
  const { enabled, reportValidationError, isToolIgnored } =
    useSchemaValidationContext();
  const [validationErrors, setValidationErrors] = useState<ZodError | null>(
    null,
  );

  useEffect(() => {
    if (enabled && result) {
      const validation = validateToolResult("KillShell", result);
      if (!validation.valid && validation.errors) {
        setValidationErrors(validation.errors);
        reportValidationError("KillShell", validation.errors);
      } else {
        setValidationErrors(null);
      }
    }
  }, [enabled, result, reportValidationError]);

  const showValidationWarning =
    enabled && validationErrors && !isToolIgnored("KillShell");

  if (isError) {
    const errorResult = result as unknown as { content?: unknown } | undefined;
    return (
      <div className="killshell-error">
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="KillShell" errors={validationErrors} />
        )}
        {typeof result === "object" && errorResult?.content
          ? String(errorResult.content)
          : "Failed to kill shell"}
      </div>
    );
  }

  if (!result) {
    return <div className="killshell-empty">No result</div>;
  }

  return (
    <div className="killshell-result">
      {showValidationWarning && validationErrors && (
        <SchemaWarning toolName="KillShell" errors={validationErrors} />
      )}
      <span className="killshell-message">{result.message}</span>
      {result.shell_id && (
        <code className="killshell-id">{result.shell_id}</code>
      )}
    </div>
  );
}

export const killShellRenderer: ToolRenderer<KillShellInput, KillShellResult> =
  {
    tool: "KillShell",

    renderToolUse(input, _context) {
      return <KillShellToolUse input={input as KillShellInput} />;
    },

    renderToolResult(result, isError, _context) {
      return (
        <KillShellToolResult
          result={result as KillShellResult}
          isError={isError}
        />
      );
    },

    getUseSummary(input) {
      return (input as KillShellInput).shell_id;
    },

    getResultSummary(result, isError) {
      if (isError) return "Error";
      const r = result as KillShellResult;
      return r?.message || "Killed";
    },
  };
