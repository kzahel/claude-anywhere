import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useInbox } from "../hooks/useInbox";
import { useProcesses } from "../hooks/useProcesses";
import { useRecentProjects } from "../hooks/useRecentProjects";
import {
  SidebarIcons,
  SidebarNavItem,
  SidebarNavSection,
} from "./SidebarNavItem";

const SWIPE_THRESHOLD = 50;

interface NavigationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  /** Desktop mode: sidebar is always visible, no overlay */
  isDesktop?: boolean;
  /** Desktop mode: sidebar is collapsed (icons only) */
  isCollapsed?: boolean;
  /** Desktop mode: callback to toggle expanded/collapsed state */
  onToggleExpanded?: () => void;
}

/**
 * A simple navigation sidebar for pages without project context.
 * Shows navigation links to Projects and Settings.
 */
export function NavigationSidebar({
  isOpen,
  onClose,
  isDesktop = false,
  isCollapsed = false,
  onToggleExpanded,
}: NavigationSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const touchStartX = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const { activeCount } = useProcesses();
  const { totalNeedsAttention, totalActive } = useInbox();
  const inboxCount = totalNeedsAttention + totalActive;
  const { recentProjects } = useRecentProjects();

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    setSwipeOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const currentX = e.touches[0]?.clientX;
    if (currentX === undefined) return;
    const diff = currentX - touchStartX.current;
    if (diff < 0) {
      setSwipeOffset(diff);
    }
  };

  const handleTouchEnd = () => {
    if (swipeOffset < -SWIPE_THRESHOLD) {
      onClose();
    }
    touchStartX.current = null;
    setSwipeOffset(0);
  };

  if (!isDesktop && !isOpen) return null;

  const SidebarToggleIcon = () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );

  return (
    <>
      {!isDesktop && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
        />
      )}
      <aside
        ref={sidebarRef}
        className="sidebar"
        onTouchStart={!isDesktop ? handleTouchStart : undefined}
        onTouchMove={!isDesktop ? handleTouchMove : undefined}
        onTouchEnd={!isDesktop ? handleTouchEnd : undefined}
        style={
          !isDesktop && swipeOffset < 0
            ? { transform: `translateX(${swipeOffset}px)`, transition: "none" }
            : undefined
        }
      >
        <div className="sidebar-header">
          {isDesktop ? (
            <button
              type="button"
              className="sidebar-toggle"
              onClick={onToggleExpanded}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <SidebarToggleIcon />
            </button>
          ) : (
            <span className="sidebar-brand">Claude Anywhere</span>
          )}
          {!isDesktop && (
            <button
              type="button"
              className="sidebar-close"
              onClick={onClose}
              aria-label="Close sidebar"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          {isDesktop && !isCollapsed && (
            <span className="sidebar-brand">Claude Anywhere</span>
          )}
        </div>

        <div className="sidebar-actions">
          <SidebarNavSection>
            <SidebarNavItem
              to="/inbox"
              icon={SidebarIcons.inbox}
              label="Inbox"
              badge={inboxCount}
              onClick={onClose}
            />
            <SidebarNavItem
              to="/projects"
              icon={SidebarIcons.projects}
              label="Projects"
              onClick={onClose}
            />
            <SidebarNavItem
              to="/agents"
              icon={SidebarIcons.agents}
              label="Agents"
              badge={activeCount}
              onClick={onClose}
            />
            <SidebarNavItem
              to="/settings"
              icon={SidebarIcons.settings}
              label="Settings"
              onClick={onClose}
            />
          </SidebarNavSection>
        </div>

        <div className="sidebar-sessions">
          {recentProjects.length > 0 ? (
            <div className="sidebar-section">
              <h3 className="sidebar-section-title">Recent Projects</h3>
              <ul className="sidebar-session-list">
                {recentProjects.map((project) => (
                  <li key={project.id}>
                    <Link
                      to={`/projects/${project.id}`}
                      onClick={onClose}
                      title={project.path}
                    >
                      <span className="sidebar-session-title">
                        <span className="sidebar-session-title-text">
                          {project.name}
                        </span>
                      </span>
                      {(project.activeOwnedCount > 0 ||
                        project.activeExternalCount > 0) && (
                        <span className="sidebar-badge sidebar-badge-running">
                          <span className="sidebar-thinking-dot" />
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="sidebar-empty">Select a project to view sessions</p>
          )}
        </div>
      </aside>
    </>
  );
}
