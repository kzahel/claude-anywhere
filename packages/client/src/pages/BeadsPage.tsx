import { useEffect, useState } from "react";
import type { BeadsIssue } from "../api/client";
import { FilterDropdown } from "../components/FilterDropdown";
import { PageHeader } from "../components/PageHeader";
import { useBeadsList } from "../hooks/useBeads";
import { useProjects } from "../hooks/useProjects";
import { useNavigationLayout } from "../layouts";

const STORAGE_KEY = "beads-selected-project";

/**
 * Get priority label (P1-P4).
 */
function getPriorityLabel(priority: number): string {
  return `P${priority}`;
}

/**
 * Get CSS class for priority badge.
 */
function getPriorityClass(priority: number): string {
  switch (priority) {
    case 1:
      return "beads-priority-1";
    case 2:
      return "beads-priority-2";
    case 3:
      return "beads-priority-3";
    default:
      return "beads-priority-4";
  }
}

/**
 * Get CSS class for status badge.
 */
function getStatusClass(status: string): string {
  switch (status) {
    case "open":
      return "beads-status-open";
    case "in_progress":
      return "beads-status-progress";
    case "closed":
      return "beads-status-closed";
    default:
      return "";
  }
}

/**
 * Format a date string to relative time.
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return "just now";
}

interface IssueCardProps {
  issue: BeadsIssue;
}

function IssueCard({ issue }: IssueCardProps) {
  return (
    <div className="beads-card">
      <div className="beads-card-header">
        <span className="beads-card-id">{issue.id}</span>
        <span
          className={`beads-priority-badge ${getPriorityClass(issue.priority)}`}
        >
          {getPriorityLabel(issue.priority)}
        </span>
        <span className={`beads-status-badge ${getStatusClass(issue.status)}`}>
          {issue.status}
        </span>
        <span className="beads-type-badge">{issue.issue_type}</span>
      </div>
      <h3 className="beads-card-title">{issue.title}</h3>
      <div className="beads-card-meta">
        <span>Updated {formatRelativeTime(issue.updated_at)}</span>
        {issue.dependency_count !== undefined && issue.dependency_count > 0 && (
          <span className="beads-deps">
            {issue.dependency_count} dep
            {issue.dependency_count !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      {issue.description && (
        <div className="beads-card-description">
          <pre>{issue.description}</pre>
        </div>
      )}
    </div>
  );
}

interface ProjectSelectorProps {
  projects: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (projectId: string) => void;
}

function ProjectSelector({
  projects,
  selectedId,
  onSelect,
}: ProjectSelectorProps) {
  const options = projects.map((project) => ({
    value: project.id,
    label: project.name,
  }));

  return (
    <FilterDropdown
      label="Project"
      options={options}
      selected={selectedId ? [selectedId] : []}
      onChange={(selected) => {
        if (selected.length > 0 && selected[0]) {
          onSelect(selected[0]);
        }
      }}
      multiSelect={false}
      placeholder="Select a project..."
    />
  );
}

export function BeadsPage() {
  const { openSidebar, isWideScreen } = useNavigationLayout();
  const { projects, loading: projectsLoading } = useProjects();

  // Selected project (stored in localStorage)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },
  );

  // Auto-select first project if none selected and projects loaded
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0 && projects[0]) {
      // project.id is already a UrlProjectId from the API
      setSelectedProjectId(projects[0].id);
      try {
        localStorage.setItem(STORAGE_KEY, projects[0].id);
      } catch {
        // Ignore storage errors
      }
    }
  }, [projects, selectedProjectId]);

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    try {
      localStorage.setItem(STORAGE_KEY, projectId);
    } catch {
      // Ignore storage errors
    }
  };

  // Fetch beads for selected project
  const { issues, status, loading, error, refetch } =
    useBeadsList(selectedProjectId);

  // Find selected project name
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

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
        <PageHeader title="Tasks" onOpenSidebar={openSidebar} />

        <main className="page-scroll-container">
          <div className="page-content-inner">
            <div className="beads-toolbar">
              <ProjectSelector
                projects={projects}
                selectedId={selectedProjectId}
                onSelect={handleProjectSelect}
              />
              <button
                type="button"
                className="beads-refresh-btn"
                onClick={refetch}
                title="Refresh tasks"
                disabled={!selectedProjectId}
              >
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
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Refresh
              </button>
            </div>

            {projectsLoading && <p className="loading">Loading projects...</p>}

            {!projectsLoading && projects.length === 0 && (
              <div className="beads-empty-state">
                <p>No projects found.</p>
                <p>Add a project first to view its tasks.</p>
              </div>
            )}

            {!projectsLoading && !selectedProjectId && projects.length > 0 && (
              <div className="beads-empty-state">
                <p>Select a project to view its tasks.</p>
              </div>
            )}

            {selectedProjectId && loading && (
              <p className="loading">Loading tasks...</p>
            )}

            {selectedProjectId && error && (
              <p className="error">Error loading tasks: {error.message}</p>
            )}

            {selectedProjectId &&
              !loading &&
              !error &&
              status &&
              (!status.initialized ? (
                <div className="beads-not-initialized">
                  <h2>Beads not initialized</h2>
                  {status.installed ? (
                    <p>
                      Beads is installed but not initialized for{" "}
                      <strong>{selectedProject?.name}</strong>.
                      <br />
                      Run <code>bd init</code> in the project directory to get
                      started.
                    </p>
                  ) : (
                    <p>
                      Beads is not installed.
                      <br />
                      Visit{" "}
                      <a
                        href="https://github.com/steveyegge/beads"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        github.com/steveyegge/beads
                      </a>{" "}
                      to install it.
                    </p>
                  )}
                </div>
              ) : (
                <IssuesList issues={issues} />
              ))}
          </div>
        </main>
      </div>
    </div>
  );
}

function IssuesList({ issues }: { issues: BeadsIssue[] }) {
  const openIssues = issues.filter((i) => i.status === "open");
  const inProgressIssues = issues.filter((i) => i.status === "in_progress");
  const closedIssues = issues.filter((i) => i.status === "closed");

  return (
    <>
      {inProgressIssues.length > 0 && (
        <section className="beads-section">
          <h2>In Progress ({inProgressIssues.length})</h2>
          <div className="beads-list">
            {inProgressIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        </section>
      )}

      <section className="beads-section">
        <h2>Open ({openIssues.length})</h2>
        {openIssues.length === 0 ? (
          <p className="beads-empty">No open tasks</p>
        ) : (
          <div className="beads-list">
            {openIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        )}
      </section>

      {closedIssues.length > 0 && (
        <section className="beads-section">
          <h2>Closed ({closedIssues.length})</h2>
          <div className="beads-list">
            {closedIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        </section>
      )}

      {issues.length === 0 && (
        <div className="beads-empty-state">
          <p>No tasks yet.</p>
          <p>
            Create one with <code>bd create "Task title"</code>
          </p>
          <p className="beads-learn-more">
            <a
              href="https://github.com/steveyegge/beads"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more about Beads
            </a>
          </p>
        </div>
      )}
    </>
  );
}
