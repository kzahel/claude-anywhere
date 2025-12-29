/**
 * Parsed user prompt with metadata extracted
 */
export interface ParsedUserPrompt {
  /** The actual user message text (without metadata tags) */
  text: string;
  /** Full paths of files the user had open in their IDE */
  openedFiles: string[];
}

/**
 * Extracts the file path from an ide_opened_file tag content.
 * Example: "The user opened the file /path/to/file.ts in the IDE" -> "/path/to/file.ts"
 */
function extractFilePath(tagContent: string): string | null {
  const match = tagContent.match(
    /(?:user opened the file|opened the file)\s+(.+?)\s+in the IDE/i,
  );
  return match?.[1] ?? null;
}

/**
 * Extracts the filename from a full file path.
 */
export function getFilename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/**
 * Parses user prompt content, extracting ide_opened_file metadata tags.
 * Returns the cleaned text and list of opened file paths.
 */
export function parseUserPrompt(content: string): ParsedUserPrompt {
  const openedFiles: string[] = [];

  // Match <ide_opened_file>...</ide_opened_file> tags
  const tagPattern = /<ide_opened_file>([\s\S]*?)<\/ide_opened_file>/g;

  // Extract file paths from each tag
  for (const match of content.matchAll(tagPattern)) {
    const tagContent = match[1] as string;
    const filePath = extractFilePath(tagContent);
    if (filePath) {
      openedFiles.push(filePath);
    }
  }

  // Remove the tags from the content
  const text = content.replace(tagPattern, "").trim();

  return { text, openedFiles };
}
