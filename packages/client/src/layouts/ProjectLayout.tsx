import { useMemo, useState } from "react";
import { Outlet, useOutletContext, useParams } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { useDrafts } from "../hooks/useDrafts";
import type { ProcessStateType } from "../hooks/useFileActivity";
import { useInbox } from "../hooks/useInbox";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useSessions } from "../hooks/useSessions";
import { useSidebarPreference } from "../hooks/useSidebarPreference";
import type { Project, SessionSummary } from "../types";

export interface ProjectLayoutContext {
  projectId: string;
  project: Project | null;
  sessions: SessionSummary[];
  processStates: Record<string, ProcessStateType>;
  loading: boolean;
  error: Error | null;
  openSidebar: () => void;
  isWideScreen: boolean;
  /** Desktop mode: sidebar is collapsed (icons only) */
  isSidebarCollapsed: boolean;
  /** Desktop mode: callback to toggle sidebar expanded/collapsed state */
  toggleSidebar: () => void;
  /** Add an optimistic session to the sidebar before SSE event arrives */
  addOptimisticSession: (sessionId: string, title: string) => void;
}

/**
 * Shared layout for project pages (sessions list, new session, session view).
 * Renders the sidebar once and passes shared data to child routes via context.
 */
export function ProjectLayout() {
  const { projectId, sessionId } = useParams<{
    projectId: string;
    sessionId?: string;
  }>();

  // Shared state and data
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isWideScreen = useMediaQuery("(min-width: 1100px)");
  const { isExpanded, toggleExpanded } = useSidebarPreference();
  const {
    project,
    sessions,
    loading,
    error,
    processStates,
    addOptimisticSession,
  } = useSessions(projectId);

  // Track which sessions have draft messages
  const sessionIds = useMemo(() => sessions.map((s) => s.id), [sessions]);
  const sessionDrafts = useDrafts(sessionIds);

  // Inbox counts - lifted here so it survives sidebar mount/unmount transitions
  const { totalNeedsAttention, totalActive } = useInbox({ projectId });
  const inboxCount = totalNeedsAttention + totalActive;

  // Guard against missing projectId
  if (!projectId) {
    return <div className="error">Invalid project URL</div>;
  }

  // Context passed to child routes
  const context: ProjectLayoutContext = {
    projectId,
    project,
    sessions,
    processStates,
    loading,
    error,
    openSidebar: () => setSidebarOpen(true),
    isWideScreen,
    isSidebarCollapsed: !isExpanded,
    toggleSidebar: toggleExpanded,
    addOptimisticSession,
  };

  return (
    <div className={`session-page ${isWideScreen ? "desktop-layout" : ""}`}>
      {/* Desktop sidebar - always visible on wide screens */}
      {isWideScreen && (
        <aside
          className={`sidebar-desktop ${!isExpanded ? "sidebar-collapsed" : ""}`}
        >
          <Sidebar
            isOpen={true}
            onClose={() => {}}
            projectId={projectId}
            currentSessionId={sessionId}
            sessions={sessions}
            processStates={processStates}
            onNavigate={() => {}}
            isDesktop={true}
            isCollapsed={!isExpanded}
            onToggleExpanded={toggleExpanded}
            sessionDrafts={sessionDrafts}
            inboxCount={inboxCount}
          />
        </aside>
      )}

      {/* Mobile sidebar - modal overlay */}
      {!isWideScreen && (
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          projectId={projectId}
          currentSessionId={sessionId}
          sessions={sessions}
          processStates={processStates}
          onNavigate={() => setSidebarOpen(false)}
          sessionDrafts={sessionDrafts}
          inboxCount={inboxCount}
        />
      )}

      {/* Child route content */}
      <Outlet context={context} />
    </div>
  );
}

/**
 * Hook for child routes to access the shared project layout context.
 */
export function useProjectLayout(): ProjectLayoutContext {
  return useOutletContext<ProjectLayoutContext>();
}
