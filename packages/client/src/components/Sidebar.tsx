import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { ProcessStateType } from "../hooks/useFileActivity";
import { useInbox } from "../hooks/useInbox";
import { useProcesses } from "../hooks/useProcesses";
import { type SessionSummary, getSessionDisplayTitle } from "../types";
import { ActivityIndicator } from "./ActivityIndicator";
import { SessionMenu } from "./SessionMenu";
import {
  SidebarIcons,
  SidebarNavItem,
  SidebarNavSection,
} from "./SidebarNavItem";

const SWIPE_THRESHOLD = 50; // Minimum distance to trigger close
const SWIPE_ENGAGE_THRESHOLD = 15; // Minimum horizontal distance before swipe engages
const RECENT_SESSIONS_INITIAL = 12; // Initial number of recent sessions to show
const RECENT_SESSIONS_INCREMENT = 10; // How many more to show on each expand

// Time threshold for stable sorting: sessions within this window use ID as tiebreaker
// This prevents rapid shuffling when multiple active sessions update frequently
const STABLE_SORT_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

// Stable sort: primarily by updatedAt, but use session ID as tiebreaker
// when sessions are within the threshold. This prevents rapid shuffling
// when multiple active sessions update frequently.
function stableSort(a: SessionSummary, b: SessionSummary): number {
  const aTime = new Date(a.updatedAt).getTime();
  const bTime = new Date(b.updatedAt).getTime();
  const timeDiff = bTime - aTime;

  // If time difference is significant, sort by time
  if (Math.abs(timeDiff) > STABLE_SORT_THRESHOLD_MS) {
    return timeDiff;
  }

  // Within threshold: use session ID for stable ordering
  return a.id.localeCompare(b.id);
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  currentSessionId?: string;
  sessions: SessionSummary[];
  processStates: Record<string, ProcessStateType>;
  onNavigate: () => void;
  /** Desktop mode: sidebar is always visible, no overlay */
  isDesktop?: boolean;
  /** Desktop mode: sidebar is collapsed (icons only) */
  isCollapsed?: boolean;
  /** Desktop mode: callback to toggle expanded/collapsed state */
  onToggleExpanded?: () => void;
  /** Set of session IDs that have unsent draft messages */
  sessionDrafts?: Set<string>;
}

export function Sidebar({
  isOpen,
  onClose,
  projectId,
  currentSessionId,
  sessions,
  processStates,
  onNavigate,
  isDesktop = false,
  isCollapsed = false,
  onToggleExpanded,
  sessionDrafts,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swipeEngaged = useRef<boolean>(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [recentSessionsLimit, setRecentSessionsLimit] = useState(
    RECENT_SESSIONS_INITIAL,
  );
  const { activeCount } = useProcesses();
  // Filter inbox to this project only for badge count
  const { totalNeedsAttention, totalActive } = useInbox({ projectId });
  const inboxCount = totalNeedsAttention + totalActive;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
    swipeEngaged.current = false;
    setSwipeOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const currentX = e.touches[0]?.clientX;
    const currentY = e.touches[0]?.clientY;
    if (currentX === undefined || currentY === undefined) return;

    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // If not yet engaged, check if we should engage the swipe
    if (!swipeEngaged.current) {
      const absDiffX = Math.abs(diffX);
      const absDiffY = Math.abs(diffY);

      // Engage swipe only if:
      // 1. Horizontal movement exceeds threshold
      // 2. Horizontal movement is greater than vertical (user is swiping, not scrolling)
      // 3. Movement is to the left (closing gesture)
      if (
        absDiffX > SWIPE_ENGAGE_THRESHOLD &&
        absDiffX > absDiffY &&
        diffX < 0
      ) {
        swipeEngaged.current = true;
      } else {
        return; // Not engaged yet, don't track offset
      }
    }

    // Only allow swiping left (negative offset)
    if (diffX < 0) {
      setSwipeOffset(diffX);
    }
  };

  const handleTouchEnd = () => {
    if (swipeEngaged.current && swipeOffset < -SWIPE_THRESHOLD) {
      onClose();
    }
    touchStartX.current = null;
    touchStartY.current = null;
    swipeEngaged.current = false;
    setSwipeOffset(0);
  };

  // Starred sessions (sorted with stable sort, limit 10)
  const starredSessions = useMemo(() => {
    return sessions
      .filter((s) => s.isStarred && !s.isArchived)
      .sort(stableSort)
      .slice(0, 10);
  }, [sessions]);

  // Sessions updated in the last 24 hours (non-starred, non-archived)
  const recentDaySessions = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const isWithinLastDay = (date: Date) => date.getTime() >= oneDayAgo;

    return sessions
      .filter(
        (s) =>
          !s.isStarred &&
          !s.isArchived &&
          isWithinLastDay(new Date(s.updatedAt)),
      )
      .sort(stableSort);
  }, [sessions]);

  // Older sessions (non-starred, non-archived, NOT in last 24 hours, limit 10)
  const olderSessions = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const isOlderThanOneDay = (date: Date) => date.getTime() < oneDayAgo;

    return sessions
      .filter(
        (s) =>
          !s.isStarred &&
          !s.isArchived &&
          isOlderThanOneDay(new Date(s.updatedAt)),
      )
      .sort(stableSort)
      .slice(0, 10);
  }, [sessions]);

  // In desktop mode, always render. In mobile mode, only render when open.
  if (!isDesktop && !isOpen) return null;

  // Sidebar toggle icon for desktop mode
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
      {/* Only show overlay in non-desktop mode */}
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
          {isDesktop && isCollapsed ? (
            /* Desktop collapsed mode: show toggle button to expand */
            <button
              type="button"
              className="sidebar-toggle"
              onClick={onToggleExpanded}
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <SidebarToggleIcon />
            </button>
          ) : isDesktop ? (
            /* Desktop expanded mode: show brand (toggle is in toolbar) */
            <span className="sidebar-brand">Claude Anywhere</span>
          ) : (
            /* Mobile mode: brand text + close button */
            <>
              <span className="sidebar-brand">Claude Anywhere</span>
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
            </>
          )}
        </div>

        <div className="sidebar-actions">
          <SidebarNavItem
            to={`/projects/${projectId}/new-session`}
            icon={SidebarIcons.newSession}
            label="New Session"
            onClick={onNavigate}
          />

          {/* Project-specific navigation */}
          <SidebarNavSection>
            <SidebarNavItem
              to={`/projects/${projectId}/inbox`}
              icon={SidebarIcons.inbox}
              label="Inbox"
              badge={inboxCount}
              onClick={onNavigate}
            />
            <SidebarNavItem
              to={`/projects/${projectId}`}
              icon={SidebarIcons.allSessions}
              label="All Sessions"
              onClick={onNavigate}
            />
          </SidebarNavSection>
        </div>

        <div className="sidebar-sessions">
          {/* Global navigation (scrolls with content) */}
          <div className="sidebar-global-nav">
            <div className="sidebar-nav-divider" />
            <SidebarNavSection>
              <SidebarNavItem
                to="/projects"
                icon={SidebarIcons.projects}
                label="Projects"
                onClick={onNavigate}
              />
              <SidebarNavItem
                to="/agents"
                icon={SidebarIcons.agents}
                label="Agents"
                badge={activeCount}
                onClick={onNavigate}
              />
              <SidebarNavItem
                to="/settings"
                icon={SidebarIcons.settings}
                label="Settings"
                onClick={onNavigate}
              />
            </SidebarNavSection>
          </div>

          {starredSessions.length > 0 && (
            <div className="sidebar-section">
              <h3 className="sidebar-section-title">Starred</h3>
              <ul className="sidebar-session-list">
                {starredSessions.map((session) => (
                  <SidebarSessionItem
                    key={session.id}
                    session={session}
                    projectId={projectId}
                    isCurrent={session.id === currentSessionId}
                    processState={processStates[session.id]}
                    onNavigate={onNavigate}
                    hasDraft={sessionDrafts?.has(session.id)}
                  />
                ))}
              </ul>
            </div>
          )}

          {recentDaySessions.length > 0 && (
            <div className="sidebar-section">
              <h3 className="sidebar-section-title">Last 24 Hours</h3>
              <ul className="sidebar-session-list">
                {recentDaySessions
                  .slice(0, recentSessionsLimit)
                  .map((session) => (
                    <SidebarSessionItem
                      key={session.id}
                      session={session}
                      projectId={projectId}
                      isCurrent={session.id === currentSessionId}
                      processState={processStates[session.id]}
                      onNavigate={onNavigate}
                      hasDraft={sessionDrafts?.has(session.id)}
                    />
                  ))}
              </ul>
              {recentDaySessions.length > recentSessionsLimit && (
                <button
                  type="button"
                  className="sidebar-show-more"
                  onClick={() =>
                    setRecentSessionsLimit(
                      (prev) => prev + RECENT_SESSIONS_INCREMENT,
                    )
                  }
                >
                  Show{" "}
                  {Math.min(
                    RECENT_SESSIONS_INCREMENT,
                    recentDaySessions.length - recentSessionsLimit,
                  )}{" "}
                  more
                </button>
              )}
            </div>
          )}

          {olderSessions.length > 0 && (
            <div className="sidebar-section">
              <h3 className="sidebar-section-title">Older</h3>
              <ul className="sidebar-session-list">
                {olderSessions.map((session) => (
                  <SidebarSessionItem
                    key={session.id}
                    session={session}
                    projectId={projectId}
                    isCurrent={session.id === currentSessionId}
                    processState={processStates[session.id]}
                    onNavigate={onNavigate}
                    hasDraft={sessionDrafts?.has(session.id)}
                  />
                ))}
              </ul>
            </div>
          )}

          {starredSessions.length === 0 &&
            recentDaySessions.length === 0 &&
            olderSessions.length === 0 && (
              <p className="sidebar-empty">No sessions yet</p>
            )}
        </div>
      </aside>
    </>
  );
}

interface SidebarSessionItemProps {
  session: SessionSummary;
  projectId: string;
  isCurrent: boolean;
  processState?: ProcessStateType;
  onNavigate: () => void;
  hasDraft?: boolean;
}

function SidebarSessionItem({
  session,
  projectId,
  isCurrent,
  processState,
  onNavigate,
  hasDraft,
}: SidebarSessionItemProps) {
  const navigate = useNavigate();
  const [localIsStarred, setLocalIsStarred] = useState<boolean | undefined>(
    undefined,
  );
  const [localIsArchived, setLocalIsArchived] = useState<boolean | undefined>(
    undefined,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [localTitle, setLocalTitle] = useState<string | undefined>(undefined);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const isSavingRef = useRef(false);

  const isStarred = localIsStarred ?? session.isStarred;
  const isArchived = localIsArchived ?? session.isArchived;
  const displayTitle = localTitle ?? getSessionDisplayTitle(session);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 0);
    }
  }, [isEditing]);

  const handleToggleStar = async () => {
    const newStarred = !isStarred;
    setLocalIsStarred(newStarred);
    try {
      await api.updateSessionMetadata(session.id, { starred: newStarred });
    } catch (err) {
      console.error("Failed to update star status:", err);
      setLocalIsStarred(undefined); // Revert on error
    }
  };

  const handleToggleArchive = async () => {
    const newArchived = !isArchived;
    setLocalIsArchived(newArchived);
    try {
      await api.updateSessionMetadata(session.id, { archived: newArchived });
    } catch (err) {
      console.error("Failed to update archive status:", err);
      setLocalIsArchived(undefined); // Revert on error
    }
  };

  const handleRename = () => {
    setRenameValue(displayTitle);
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    if (isSavingRef.current) return;
    setIsEditing(false);
    setRenameValue("");
  };

  const handleSaveRename = async () => {
    if (!renameValue.trim() || isSaving) return;
    if (renameValue.trim() === displayTitle) {
      handleCancelEditing();
      return;
    }
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await api.updateSessionMetadata(session.id, {
        title: renameValue.trim(),
      });
      setLocalTitle(renameValue.trim());
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to rename session:", err);
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  const handleRenameBlur = () => {
    if (isSavingRef.current) return;
    if (!renameValue.trim() || renameValue.trim() === displayTitle) {
      handleCancelEditing();
      return;
    }
    handleSaveRename();
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelEditing();
    }
  };

  // Determine activity indicator
  const getActivityIndicator = () => {
    // External sessions always show external badge
    if (session.status.state === "external") {
      return <span className="sidebar-badge sidebar-badge-external">Ext</span>;
    }

    // Priority 1: Needs input
    if (session.pendingInputType) {
      const label = session.pendingInputType === "tool-approval" ? "Appr" : "Q";
      return (
        <span className="sidebar-badge sidebar-badge-needs-input">{label}</span>
      );
    }

    // Priority 2: Running (thinking)
    const effectiveProcessState = processState ?? session.processState;
    if (effectiveProcessState === "running") {
      return (
        <ActivityIndicator variant="badge" className="sidebar-badge-running" />
      );
    }

    // Unread - handled via CSS class on <li>, not a badge
    // Active (owned) sessions don't need a dot - "Thinking" badge shows when running
    return null;
  };

  const liClassName = [isCurrent && "current", session.hasUnread && "unread"]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={liClassName || undefined}>
      {isEditing ? (
        <input
          ref={renameInputRef}
          type="text"
          className="sidebar-rename-input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameBlur}
          onKeyDown={handleRenameKeyDown}
          disabled={isSaving}
        />
      ) : (
        <Link
          to={`/projects/${projectId}/sessions/${session.id}`}
          onClick={onNavigate}
          title={session.fullTitle || displayTitle}
        >
          <span className="sidebar-session-title">
            {isStarred && (
              <svg
                className="sidebar-star"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            )}
            <span className="sidebar-session-title-text">{displayTitle}</span>
            {hasDraft && <span className="sidebar-draft">(draft)</span>}
          </span>
          {getActivityIndicator()}
        </Link>
      )}
      <SessionMenu
        sessionId={session.id}
        isStarred={isStarred ?? false}
        isArchived={isArchived ?? false}
        onToggleStar={handleToggleStar}
        onToggleArchive={handleToggleArchive}
        onRename={handleRename}
        useEllipsisIcon
        useFixedPositioning
        className="sidebar-session-menu"
      />
    </li>
  );
}
