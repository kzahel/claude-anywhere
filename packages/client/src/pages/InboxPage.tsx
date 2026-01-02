import { InboxContent } from "../components/InboxContent";
import { PageHeader } from "../components/PageHeader";
import { useNavigationLayout } from "../layouts";

export interface InboxPageProps {
  /** Optional projectId to filter inbox to a single project */
  projectId?: string;
  /** Project name to display in header (for project-specific inbox) */
  projectName?: string;
}

/**
 * Global inbox page with standalone layout (not using project layout).
 * Shows sessions from all projects that need attention.
 */
export function InboxPage({ projectId, projectName }: InboxPageProps) {
  const { openSidebar, isWideScreen } = useNavigationLayout();

  return (
    <div
      className={isWideScreen ? "main-content-wrapper" : "main-content-mobile"}
    >
      <div
        className={
          isWideScreen
            ? "main-content-constrained"
            : "main-content-mobile-inner"
        }
      >
        <PageHeader
          title={projectName ? `${projectName} Inbox` : "Inbox"}
          onOpenSidebar={openSidebar}
        />

        <InboxContent
          projectId={projectId}
          hideProjectName={!!projectId}
          showGlobalInboxLink={!!projectId}
        />
      </div>
    </div>
  );
}
