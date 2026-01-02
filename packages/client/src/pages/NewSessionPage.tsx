import { NewSessionForm } from "../components/NewSessionForm";
import { PageHeader } from "../components/PageHeader";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
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

  // Update browser tab title
  useDocumentTitle(project?.name, "New Session");

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
            showCancel
          />
        </main>
      </div>
    </div>
  );
}
