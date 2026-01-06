import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContentBlock, ContentRenderer, RenderContext } from "../types";

/** Client-side markdown disabled by default. Set VITE_DISABLE_CLIENT_MARKDOWN=false to enable */
const DISABLE_CLIENT_MARKDOWN =
  import.meta.env.VITE_DISABLE_CLIENT_MARKDOWN !== "false";

interface TextBlock extends ContentBlock {
  type: "text";
  text: string;
  /** Server-rendered HTML (if available) */
  _renderedHtml?: string;
}

/**
 * Text renderer - displays text content with markdown rendering
 */
function TextRendererComponent({ block }: { block: TextBlock }) {
  // Prefer server-rendered HTML if available
  if (block._renderedHtml) {
    return (
      <div
        className="text-block"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered markdown
        dangerouslySetInnerHTML={{ __html: block._renderedHtml }}
      />
    );
  }

  // Fallback to client-side markdown (can be disabled for testing)
  if (DISABLE_CLIENT_MARKDOWN) {
    return (
      <div className="text-block">
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
          {block.text}
        </pre>
      </div>
    );
  }

  return (
    <div className="text-block">
      <Markdown remarkPlugins={[remarkGfm]}>{block.text}</Markdown>
    </div>
  );
}

export const textRenderer: ContentRenderer<TextBlock> = {
  type: "text",
  render(block, _context) {
    return <TextRendererComponent block={block as TextBlock} />;
  },
  getSummary(block) {
    const text = (block as TextBlock).text;
    return text.length > 100 ? `${text.slice(0, 97)}...` : text;
  },
};
