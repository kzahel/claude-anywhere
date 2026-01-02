import { useEffect } from "react";

const BASE_TITLE = "Claude Anywhere";

/**
 * Truncates a string to a maximum length, adding ellipsis if needed.
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 1)}…`;
}

/**
 * Updates the document title based on project and session names.
 * - Project only: Full project name (no truncation)
 * - Project + Session: "Project (10 chars) - Session (20 chars)"
 */
export function useDocumentTitle(
  projectName?: string | null,
  sessionName?: string | null,
) {
  useEffect(() => {
    let title = BASE_TITLE;

    if (projectName) {
      if (sessionName) {
        // Both project and session - truncate both
        const truncatedProject = truncate(projectName, 10);
        const truncatedSession = truncate(sessionName, 20);
        title = `${truncatedProject} - ${truncatedSession}`;
      } else {
        // Project only - show full name
        title = projectName;
      }
    }

    document.title = title;

    // Restore base title on unmount
    return () => {
      document.title = BASE_TITLE;
    };
  }, [projectName, sessionName]);
}
