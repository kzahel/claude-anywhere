import { Link } from "react-router-dom";
import { NewSessionForm } from "../components/NewSessionForm";
import { PageHeader } from "../components/PageHeader";
import { useProjectLayout } from "../layouts";

export function NewSessionPage() {
  const {
    projectId,
    project,
    loading,
    error,
    openSidebar,
    isWideScreen,
    toggleSidebar,
    isSidebarCollapsed,
    addOptimisticSession,
  } = useProjectLayout();

  // Render loading/error states
  if (loading || error) {
    return (
      <div
        className={
          isWideScreen ? "main-content-wrapper" : "main-content-mobile"
        }
      >
        <div
          className={
            isWideScreen
              ? "main-content-constrained"
              : "main-content-mobile-inner"
          }
        >
          <PageHeader
            title="New Session"
            onOpenSidebar={openSidebar}
            onToggleSidebar={toggleSidebar}
            isWideScreen={isWideScreen}
            isSidebarCollapsed={isSidebarCollapsed}
          />
          <main className="sessions-page-content">
            {loading ? (
              <div className="loading">Loading...</div>
            ) : (
              <div className="error">Error: {error?.message}</div>
            )}
          </main>
        </div>
      </div>
    );
  }

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
          title={project?.name ?? "New Session"}
          onOpenSidebar={openSidebar}
          onToggleSidebar={toggleSidebar}
          isWideScreen={isWideScreen}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="sessions-page-content">
          <NewSessionForm
            projectId={projectId}
            onOptimisticSession={addOptimisticSession}
          />
          <div className="new-session-cancel-link">
            <Link to={`/projects/${projectId}`}>Cancel</Link>
          </div>
        </main>
      </div>
    </div>
  );
}
