import { useState } from "react";
import { Link } from "react-router-dom";
import { type InboxItem, useInbox } from "../hooks/useInbox";
import type { Project } from "../types";
import { ThinkingIndicator } from "./ThinkingIndicator";

/**
 * Format relative time from a timestamp to now.
 */
function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Tier configuration for visual styling.
 */
interface TierConfig {
  key: string;
  title: string;
  colorClass: string;
  getBadge?: (item: InboxItem) => { label: string; className: string } | null;
}

const TIER_CONFIGS: TierConfig[] = [
  {
    key: "needsAttention",
    title: "Needs Attention",
    colorClass: "inbox-tier-attention",
    getBadge: (item) => {
      if (item.pendingInputType === "tool-approval") {
        return { label: "Approval", className: "inbox-badge-approval" };
      }
      if (item.pendingInputType === "user-question") {
        return { label: "Question", className: "inbox-badge-question" };
      }
      return null;
    },
  },
  {
    key: "active",
    title: "Active",
    colorClass: "inbox-tier-active",
    // Active items show a pulsing dot instead of a text badge
  },
  {
    key: "recentActivity",
    title: "Recent Activity",
    colorClass: "inbox-tier-recent",
  },
  {
    key: "unread8h",
    title: "Unread (8h)",
    colorClass: "inbox-tier-unread8h",
  },
  {
    key: "unread24h",
    title: "Unread (24h)",
    colorClass: "inbox-tier-unread24h",
  },
];

interface InboxSectionProps {
  config: TierConfig;
  items: InboxItem[];
  /** When true, hides project name (for single-project inbox) */
  hideProjectName?: boolean;
}

function InboxSection({ config, items, hideProjectName }: InboxSectionProps) {
  const isEmpty = items.length === 0;

  return (
    <section
      className={`inbox-section ${config.colorClass} ${isEmpty ? "inbox-section-empty" : ""}`}
    >
      <h2 className="inbox-section-header">
        {config.title}
        <span className="inbox-section-count">{items.length}</span>
      </h2>
      {isEmpty ? (
        <p className="inbox-section-empty-message">No sessions</p>
      ) : (
        <ul className="inbox-list">
          {items.map((item) => {
            const badge = config.getBadge?.(item);
            const liClassName = item.hasUnread ? "unread" : undefined;
            return (
              <li key={item.sessionId} className={liClassName}>
                <Link
                  to={`/projects/${item.projectId}/sessions/${item.sessionId}`}
                >
                  <div className="inbox-item-main">
                    <span className="inbox-item-title">
                      {item.sessionTitle ?? "Untitled"}
                    </span>
                    {badge && (
                      <span className={`inbox-item-badge ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                    {config.key === "active" && <ThinkingIndicator />}
                  </div>
                  <div className="inbox-item-meta">
                    {!hideProjectName && (
                      <span className="inbox-item-project">
                        {item.projectName}
                      </span>
                    )}
                    <span className="inbox-item-time">
                      {formatRelativeTime(item.updatedAt)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export interface InboxContentProps {
  /** Optional projectId to filter inbox to a single project */
  projectId?: string;
  /** List of projects for the filter dropdown */
  projects?: Project[];
  /** Callback when project filter changes */
  onProjectChange?: (projectId: string | undefined) => void;
}

/**
 * Shared inbox content component.
 * Handles fetching, displaying tiers, refresh button, and empty/loading/error states.
 */
export function InboxContent({
  projectId,
  projects,
  onProjectChange,
}: InboxContentProps) {
  const {
    needsAttention,
    active,
    recentActivity,
    unread8h,
    unread24h,
    loading,
    error,
    refresh,
    totalItems,
  } = useInbox({ projectId });

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  // Map tier keys to their data
  const tierData: Record<string, InboxItem[]> = {
    needsAttention,
    active,
    recentActivity,
    unread8h,
    unread24h,
  };

  const isEmpty = totalItems === 0 && !loading;

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onProjectChange?.(value === "" ? undefined : value);
  };

  return (
    <main className="page-scroll-container">
      <div className="page-content-inner inbox-content">
        {/* Toolbar with project filter and refresh button */}
        <div className="inbox-toolbar">
          {projects && projects.length > 0 && (
            <select
              className="inbox-project-filter"
              value={projectId ?? ""}
              onChange={handleProjectChange}
              aria-label="Filter by project"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="inbox-refresh-button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            title="Refresh inbox"
          >
            <svg
              className={refreshing ? "spinning" : ""}
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
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading && <p className="loading">Loading inbox...</p>}

        {error && <p className="error">Error loading inbox: {error.message}</p>}

        {!loading && !error && isEmpty && (
          <div className="inbox-empty">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <h3>All caught up!</h3>
            <p>
              {projectId
                ? "No sessions need attention in this project."
                : "No sessions need attention."}
            </p>
          </div>
        )}

        {!loading && !error && !isEmpty && (
          <div className="inbox-tiers">
            {TIER_CONFIGS.map((config) => (
              <InboxSection
                key={config.key}
                config={config}
                items={tierData[config.key] ?? []}
                hideProjectName={!!projectId}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
