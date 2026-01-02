import { useState } from "react";
import { Link } from "react-router-dom";
import { type InboxItem, useInbox } from "../hooks/useInbox";
import { ActivityIndicator } from "./ActivityIndicator";

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
                    {config.key === "active" && (
                      <ActivityIndicator variant="badge" />
                    )}
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
  /** When true, hides project names in items (for project-specific inbox) */
  hideProjectName?: boolean;
  /** When true, shows link to global inbox (for project-specific inbox) */
  showGlobalInboxLink?: boolean;
}

/**
 * Shared inbox content component used by both global and project-specific inbox pages.
 * Handles fetching, displaying tiers, refresh button, and empty/loading/error states.
 */
export function InboxContent({
  projectId,
  hideProjectName,
  showGlobalInboxLink,
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

  return (
    <main className="sessions-page-content inbox-content">
      {/* Toolbar with refresh button and optional global inbox link */}
      <div className="inbox-toolbar">
        {showGlobalInboxLink && (
          <Link to="/inbox" className="inbox-global-button">
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
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            Global Inbox
          </Link>
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
              hideProjectName={hideProjectName}
            />
          ))}
        </div>
      )}
    </main>
  );
}
