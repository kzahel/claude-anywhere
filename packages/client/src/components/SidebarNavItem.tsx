import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

/**
 * Common SVG icons used in sidebar navigation.
 * Extracted to avoid duplication across components.
 */
export const SidebarIcons = {
  inbox: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  projects: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  agents: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="3" />
      <path d="M12 8v3" />
      <circle cx="8" cy="16" r="1" />
      <circle cx="16" cy="16" r="1" />
    </svg>
  ),
  settings: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  allSessions: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  ),
  newSession: (
    <svg
      className="sidebar-new-session-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="12" fill="var(--app-claude-orange)" />
      <line
        x1="12"
        y1="7"
        x2="12"
        y2="17"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="7"
        y1="12"
        x2="17"
        y2="12"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
};

export interface SidebarNavItemProps {
  /** Route path to navigate to */
  to: string;
  /** Icon to display (use SidebarIcons or custom ReactNode) */
  icon: ReactNode;
  /** Label text */
  label: string;
  /** Optional badge count (displays if > 0) */
  badge?: number;
  /** Called when item is clicked (e.g., to close mobile sidebar) */
  onClick?: () => void;
  /** Title tooltip */
  title?: string;
}

/**
 * Unified sidebar navigation item component.
 * Provides consistent styling across NavigationSidebar and Sidebar.
 */
export function SidebarNavItem({
  to,
  icon,
  label,
  badge,
  onClick,
  title,
}: SidebarNavItemProps) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`sidebar-nav-item ${isActive ? "active" : ""}`}
      onClick={onClick}
      title={title ?? label}
    >
      {icon}
      <span className="sidebar-nav-text">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="sidebar-nav-badge">{badge}</span>
      )}
    </Link>
  );
}

export interface SidebarNavSectionProps {
  children: ReactNode;
}

/**
 * Container for sidebar navigation items.
 * Provides consistent spacing between items.
 */
export function SidebarNavSection({ children }: SidebarNavSectionProps) {
  return <nav className="sidebar-nav-section">{children}</nav>;
}
