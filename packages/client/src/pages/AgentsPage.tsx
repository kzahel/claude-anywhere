import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { type ProcessInfo, useProcesses } from "../hooks/useProcesses";
import { useNavigationLayout } from "../layouts";

/**
 * Format uptime duration from start time to now.
 */
function formatUptime(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = now - start;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Get a display label for the process state.
 */
function getStateLabel(state: string): string {
  switch (state) {
    case "running":
      return "Running";
    case "waiting-input":
      return "Needs Input";
    case "idle":
      return "Idle";
    case "terminated":
      return "Terminated";
    default:
      return state;
  }
}

/**
 * Get CSS class for state badge.
 */
function getStateBadgeClass(state: string): string {
  switch (state) {
    case "running":
      return "agent-state-running";
    case "waiting-input":
      return "agent-state-input";
    case "idle":
      return "agent-state-idle";
    case "terminated":
      return "agent-state-terminated";
    default:
      return "";
  }
}

interface ProcessCardProps {
  process: ProcessInfo;
  isTerminated?: boolean;
}

function ProcessCard({ process, isTerminated = false }: ProcessCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Extract project name from path (last directory)
  const projectName =
    process.projectPath.split("/").pop() ?? process.projectPath;

  return (
    <button
      type="button"
      className={`agent-card ${isTerminated ? "agent-card-terminated" : ""}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="agent-card-header">
        <div className="agent-card-title">
          <span className="agent-card-session-title">
            {process.sessionTitle || "Untitled Session"}
          </span>
          <span
            className={`agent-state-badge ${getStateBadgeClass(process.state)}`}
          >
            {getStateLabel(process.state)}
          </span>
        </div>
        <div className="agent-card-project">{projectName}</div>
        <div className="agent-card-meta">
          {!isTerminated && (
            <span className="agent-card-uptime">
              {formatUptime(process.startedAt)}
            </span>
          )}
          <svg
            className={`agent-card-chevron ${expanded ? "expanded" : ""}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="agent-card-details">
          <div className="agent-detail-row">
            <span className="agent-detail-label">Session ID</span>
            <span className="agent-detail-value agent-detail-mono">
              {process.sessionId}
            </span>
          </div>
          <div className="agent-detail-row">
            <span className="agent-detail-label">Project Path</span>
            <span className="agent-detail-value agent-detail-mono">
              {process.projectPath}
            </span>
          </div>
          {process.permissionMode && (
            <div className="agent-detail-row">
              <span className="agent-detail-label">Permission Mode</span>
              <span className="agent-detail-value">
                {process.permissionMode}
              </span>
            </div>
          )}
          {process.queueDepth > 0 && (
            <div className="agent-detail-row">
              <span className="agent-detail-label">Messages Queued</span>
              <span className="agent-detail-value">{process.queueDepth}</span>
            </div>
          )}
          {process.terminationReason && (
            <div className="agent-detail-row">
              <span className="agent-detail-label">Termination Reason</span>
              <span className="agent-detail-value">
                {process.terminationReason}
              </span>
            </div>
          )}
          <div className="agent-card-actions">
            <Link
              to={`/projects/${process.projectId}/sessions/${process.sessionId}`}
              className="agent-view-session-link"
              onClick={(e) => e.stopPropagation()}
            >
              {process.sessionTitle || "View Session"} →
            </Link>
          </div>
        </div>
      )}
    </button>
  );
}

export function AgentsPage() {
  const { processes, terminatedProcesses, loading, error, activeCount } =
    useProcesses();

  const { openSidebar, isWideScreen } = useNavigationLayout();

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
        <PageHeader title="Agents" onOpenSidebar={openSidebar} />

        <main className="sessions-page-content">
          {loading && <p className="loading">Loading agents...</p>}

          {error && (
            <p className="error">Error loading agents: {error.message}</p>
          )}

          {!loading && !error && (
            <>
              <section className="agents-section">
                <h2>
                  Active Agents
                  {activeCount > 0 && (
                    <span className="agents-count-badge">{activeCount}</span>
                  )}
                </h2>
                {processes.length === 0 ? (
                  <p className="agents-empty">No active agents</p>
                ) : (
                  <div className="agents-list">
                    {processes.map((process) => (
                      <ProcessCard key={process.id} process={process} />
                    ))}
                  </div>
                )}
              </section>

              {terminatedProcesses.length > 0 && (
                <section className="agents-section">
                  <h2>Recently Terminated</h2>
                  <div className="agents-list">
                    {terminatedProcesses.map((process) => (
                      <ProcessCard
                        key={process.id}
                        process={process}
                        isTerminated
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
