import { memo } from "react";
import { getFilename, parseUserPrompt } from "../../lib/parseUserPrompt";
import type { ContentBlock } from "../../types";

interface Props {
  content: string | ContentBlock[];
}

/**
 * Renders file metadata (opened files) below the user prompt
 */
function OpenedFilesMetadata({ files }: { files: string[] }) {
  if (files.length === 0) return null;

  return (
    <div className="user-prompt-metadata">
      {files.map((filePath) => (
        <span
          key={filePath}
          className="opened-file"
          title={`file was opened in editor: ${filePath}`}
        >
          {getFilename(filePath)}
        </span>
      ))}
    </div>
  );
}

export const UserPromptBlock = memo(function UserPromptBlock({
  content,
}: Props) {
  if (typeof content === "string") {
    const { text, openedFiles } = parseUserPrompt(content);

    // Don't render if there's no actual text content
    if (!text) {
      return openedFiles.length > 0 ? (
        <OpenedFilesMetadata files={openedFiles} />
      ) : null;
    }

    return (
      <div className="user-prompt-container">
        <div className="message message-user-prompt">
          <div className="message-content">
            <div className="text-block">{text}</div>
          </div>
        </div>
        <OpenedFilesMetadata files={openedFiles} />
      </div>
    );
  }

  // Array content - extract text blocks for display
  const textContent = content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");

  // Parse the combined text content for metadata
  const { text, openedFiles } = parseUserPrompt(textContent);

  if (!text) {
    return openedFiles.length > 0 ? (
      <OpenedFilesMetadata files={openedFiles} />
    ) : (
      <div className="message message-user-prompt">
        <div className="message-content">
          <div className="text-block">[Complex content]</div>
        </div>
      </div>
    );
  }

  return (
    <div className="user-prompt-container">
      <div className="message message-user-prompt">
        <div className="message-content">
          <div className="text-block">{text}</div>
        </div>
      </div>
      <OpenedFilesMetadata files={openedFiles} />
    </div>
  );
});
