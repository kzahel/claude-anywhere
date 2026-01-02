import { InboxContent } from "../components/InboxContent";
import { PageHeader } from "../components/PageHeader";
import { useProjectLayout } from "../layouts";

/**
 * Project-specific inbox page. Uses the project layout context and filters
 * inbox to show only sessions from the current project.
 */
export function ProjectInboxPage() {
  const { projectId, project, openSidebar, isWideScreen } = useProjectLayout();

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
          title={`${project?.name ?? "Project"} Inbox`}
          onOpenSidebar={openSidebar}
        />

        <InboxContent
          projectId={projectId}
          hideProjectName={true}
          showGlobalInboxLink={true}
        />
      </div>
    </div>
  );
}
