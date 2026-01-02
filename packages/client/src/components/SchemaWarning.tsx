import { useState } from "react";
import type { ZodError } from "zod";

interface SchemaWarningProps {
  toolName: string;
  errors: ZodError;
}

/**
 * Format Zod errors into a human-readable summary.
 * Groups missing/invalid fields for concise display.
 */
function formatErrors(errors: ZodError): string {
  const issues = errors.issues;

  // Group by error type
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const issue of issues) {
    const path = issue.path.join(".");
    // Check for undefined/missing fields using message pattern
    if (
      issue.code === "invalid_type" &&
      issue.message.toLowerCase().includes("required")
    ) {
      missing.push(path || "(root)");
    } else {
      invalid.push(`${path || "(root)"}: ${issue.message}`);
    }
  }

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`Missing fields: ${missing.join(", ")}`);
  }
  if (invalid.length > 0) {
    parts.push(`Invalid: ${invalid.join("; ")}`);
  }

  return parts.join("\n") || "Schema validation failed";
}

const GITHUB_ISSUES_URL = "https://github.com/kzahel/claude-anywhere/issues";

/**
 * Small warning badge that appears on tool results that fail schema validation.
 * Shows a tooltip with error details on hover.
 */
export function SchemaWarning({ toolName, errors }: SchemaWarningProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const errorSummary = formatErrors(errors);

  return (
    <span
      className="schema-warning"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      title={`Schema warning for ${toolName}`}
    >
      <span className="schema-warning-icon" aria-hidden="true">
        !
      </span>
      {showTooltip && (
        <div className="schema-warning-tooltip">
          <div className="schema-warning-tooltip-title">
            Schema validation failed: {toolName}
          </div>
          <pre className="schema-warning-tooltip-errors">{errorSummary}</pre>
          <a
            href={GITHUB_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="schema-warning-tooltip-link"
            onClick={(e) => e.stopPropagation()}
          >
            Report issue
          </a>
        </div>
      )}
    </span>
  );
}
