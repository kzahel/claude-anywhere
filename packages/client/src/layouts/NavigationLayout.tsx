import { useState } from "react";
import { Outlet, useOutletContext } from "react-router-dom";
import { NavigationSidebar } from "../components/NavigationSidebar";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useSidebarPreference } from "../hooks/useSidebarPreference";

export interface NavigationLayoutContext {
  /** Open the mobile sidebar */
  openSidebar: () => void;
  /** Whether we're in desktop mode (wide screen) */
  isWideScreen: boolean;
  /** Desktop mode: sidebar is collapsed (icons only) */
  isSidebarCollapsed: boolean;
  /** Desktop mode: callback to toggle sidebar expanded/collapsed state */
  toggleSidebar: () => void;
}

/**
 * Shared layout for top-level navigation pages (inbox, projects, settings, agents).
 * Renders the NavigationSidebar once so it persists across route changes.
 */
export function NavigationLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isWideScreen = useMediaQuery("(min-width: 1100px)");
  const { isExpanded, toggleExpanded } = useSidebarPreference();

  const context: NavigationLayoutContext = {
    openSidebar: () => setSidebarOpen(true),
    isWideScreen,
    isSidebarCollapsed: !isExpanded,
    toggleSidebar: toggleExpanded,
  };

  return (
    <div className={`session-page ${isWideScreen ? "desktop-layout" : ""}`}>
      {/* Desktop sidebar - always visible on wide screens */}
      {isWideScreen && (
        <aside
          className={`sidebar-desktop ${!isExpanded ? "sidebar-collapsed" : ""}`}
        >
          <NavigationSidebar
            isOpen={true}
            onClose={() => {}}
            isDesktop={true}
            isCollapsed={!isExpanded}
            onToggleExpanded={toggleExpanded}
          />
        </aside>
      )}

      {/* Mobile sidebar - modal overlay */}
      {!isWideScreen && (
        <NavigationSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* Child route content */}
      <Outlet context={context} />
    </div>
  );
}

/**
 * Hook for child routes to access the shared navigation layout context.
 */
export function useNavigationLayout(): NavigationLayoutContext {
  return useOutletContext<NavigationLayoutContext>();
}
