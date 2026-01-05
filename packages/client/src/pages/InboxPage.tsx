import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { InboxContent } from "../components/InboxContent";
import { PageHeader } from "../components/PageHeader";
import { useProjects } from "../hooks/useProjects";
import { useNavigationLayout } from "../layouts";

/**
 * Global inbox page with project filter dropdown.
 * Shows sessions from all projects (or filtered to one) that need attention.
 */
export function InboxPage() {
  const { openSidebar, isWideScreen } = useNavigationLayout();
  const { projects } = useProjects();
  const [searchParams, setSearchParams] = useSearchParams();

  const projectId = searchParams.get("project") ?? undefined;

  const handleProjectChange = useCallback(
    (newProjectId: string | undefined) => {
      if (newProjectId) {
        setSearchParams({ project: newProjectId });
      } else {
        setSearchParams({});
      }
    },
    [setSearchParams],
  );

  // Find project name for header when filtered
  const projectName = useMemo(() => {
    if (!projectId) return undefined;
    return projects.find((p) => p.id === projectId)?.name;
  }, [projectId, projects]);

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
          projects={projects}
          onProjectChange={handleProjectChange}
        />
      </div>
    </div>
  );
}
