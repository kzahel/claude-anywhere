import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ExitPlanModeInput,
  ExitPlanModeResult,
  ToolRenderer,
} from "./types";

/** Client-side markdown disabled by default. Set VITE_DISABLE_CLIENT_MARKDOWN=false to enable */
const DISABLE_CLIENT_MARKDOWN =
  import.meta.env.VITE_DISABLE_CLIENT_MARKDOWN !== "false";

/** Extended input type with server-rendered HTML */
interface ExitPlanModeInputWithHtml extends ExitPlanModeInput {
  _renderedHtml?: string;
}

/** Extended result type with server-rendered HTML */
interface ExitPlanModeResultWithHtml extends ExitPlanModeResult {
  _renderedHtml?: string;
}

export const exitPlanModeRenderer: ToolRenderer<
  ExitPlanModeInput,
  ExitPlanModeResult
> = {
  tool: "ExitPlanMode",

  // These are required by the interface but won't be used since renderInline takes over
  renderToolUse() {
    return null;
  },

  renderToolResult() {
    return null;
  },

  // Render inline without any tool-row wrapper - full control over rendering
  renderInline(input, result, isError, status) {
    const planInput = input as ExitPlanModeInputWithHtml;
    const planResult = result as ExitPlanModeResultWithHtml;

    // Get plan content from input (tool_use) or result (tool_result)
    const plan: string | undefined = planInput?.plan || planResult?.plan;

    // Get pre-rendered HTML from server (if available)
    const renderedHtml: string | undefined =
      planInput?._renderedHtml || planResult?._renderedHtml;

    if (isError) {
      const errorResult = result as unknown as
        | { content?: unknown }
        | undefined;
      return (
        <div className="exitplan-error">
          {typeof result === "object" && errorResult?.content
            ? String(errorResult.content)
            : "Exit plan mode failed"}
        </div>
      );
    }

    // Show "Planning..." only if we don't have plan content yet
    if (!plan && !renderedHtml) {
      if (status === "pending") {
        return <div className="exitplan-pending">Planning...</div>;
      }
      return null;
    }

    // Show the plan content (works for both pending and complete states)
    // Prefer server-rendered HTML if available for consistent styling
    return (
      <div
        className={`exitplan-inline ${status === "pending" ? "pending" : ""}`}
      >
        {renderedHtml ? (
          // Server-rendered HTML with shiki syntax highlighting
          // biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered markdown is safe
          <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        ) : DISABLE_CLIENT_MARKDOWN ? (
          // Plain text fallback when client markdown is disabled
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
            {plan}
          </pre>
        ) : (
          // Fallback to client-side markdown rendering
          <Markdown remarkPlugins={[remarkGfm]}>{plan}</Markdown>
        )}
      </div>
    );
  },

  getUseSummary(_input) {
    return "Exit plan mode";
  },

  getResultSummary(_result, isError) {
    if (isError) return "Error";
    return "Plan";
  },
};
