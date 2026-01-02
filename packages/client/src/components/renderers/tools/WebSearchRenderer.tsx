import { useEffect, useState } from "react";
import type { ZodError } from "zod";
import { useSchemaValidationContext } from "../../../contexts/SchemaValidationContext";
import { validateToolResult } from "../../../lib/validateToolResult";
import { SchemaWarning } from "../../SchemaWarning";
import type { ToolRenderer, WebSearchInput, WebSearchResult } from "./types";

/**
 * WebSearch tool use - shows search query
 */
function WebSearchToolUse({ input }: { input: WebSearchInput }) {
  return (
    <div className="websearch-tool-use">
      <span className="websearch-query">{input.query}</span>
    </div>
  );
}

/**
 * WebSearch tool result - shows search results as links
 */
function WebSearchToolResult({
  result,
  isError,
}: {
  result: WebSearchResult;
  isError: boolean;
}) {
  const { enabled, reportValidationError, isToolIgnored } =
    useSchemaValidationContext();
  const [validationErrors, setValidationErrors] = useState<ZodError | null>(
    null,
  );

  useEffect(() => {
    if (enabled && result) {
      const validation = validateToolResult("WebSearch", result);
      if (!validation.valid && validation.errors) {
        setValidationErrors(validation.errors);
        reportValidationError("WebSearch", validation.errors);
      } else {
        setValidationErrors(null);
      }
    }
  }, [enabled, result, reportValidationError]);

  const showValidationWarning =
    enabled && validationErrors && !isToolIgnored("WebSearch");

  if (isError) {
    const errorResult = result as unknown as { content?: unknown } | undefined;
    return (
      <div className="websearch-error">
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="WebSearch" errors={validationErrors} />
        )}
        {typeof result === "object" && errorResult?.content
          ? String(errorResult.content)
          : "Search failed"}
      </div>
    );
  }

  if (!result) {
    return <div className="websearch-empty">No results</div>;
  }

  // Flatten results from potentially nested structure
  const allResults =
    result.results?.flatMap((r) => r.content || []).filter(Boolean) || [];

  return (
    <div className="websearch-result">
      <div className="websearch-header">
        <span className="websearch-query-display">"{result.query}"</span>
        {result.durationSeconds !== undefined && (
          <span className="badge">{result.durationSeconds.toFixed(2)}s</span>
        )}
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="WebSearch" errors={validationErrors} />
        )}
      </div>
      {allResults.length > 0 ? (
        <ul className="websearch-links">
          {allResults.map((item, i) => (
            <li key={`${item.url}-${i}`} className="websearch-link-item">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="websearch-link"
              >
                {item.title}
              </a>
              <span className="websearch-url">{item.url}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="websearch-empty">No results found</div>
      )}
    </div>
  );
}

export const webSearchRenderer: ToolRenderer<WebSearchInput, WebSearchResult> =
  {
    tool: "WebSearch",

    renderToolUse(input, _context) {
      return <WebSearchToolUse input={input as WebSearchInput} />;
    },

    renderToolResult(result, isError, _context) {
      return (
        <WebSearchToolResult
          result={result as WebSearchResult}
          isError={isError}
        />
      );
    },

    getUseSummary(input) {
      return (input as WebSearchInput).query;
    },

    getResultSummary(result, isError) {
      if (isError) return "Error";
      const r = result as WebSearchResult;
      const count = r?.results?.flatMap((res) => res.content || []).length || 0;
      return `${count} results`;
    },
  };
