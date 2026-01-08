import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { ActiveCountBadge } from "../components/StatusBadge";
import { useProjects } from "../hooks/useProjects";
import { useNavigationLayout } from "../layouts";

export function ProjectsPage() {
  const { projects, loading, error, refetch } = useProjects();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();

  const { openSidebar, isWideScreen, toggleSidebar, isSidebarCollapsed } =
    useNavigationLayout();

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectPath.trim()) return;

    setAdding(true);
    setAddError(null);

    try {
      const { project } = await api.addProject(newProjectPath.trim());
      await refetch();
      setNewProjectPath("");
      setShowAddForm(false);
      // Navigate to sessions filtered by the new project
      navigate(`/sessions?project=${project.id}`);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add project");
    } finally {
      setAdding(false);
    }
  };

  if (loading) return <div className="loading">Loading projects...</div>;
  if (error) return <div className="error">Error: {error.message}</div>;

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
          title="Projects"
          onOpenSidebar={openSidebar}
          onToggleSidebar={toggleSidebar}
          isWideScreen={isWideScreen}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="page-scroll-container">
          <div className="page-content-inner">
            {/* Add Project Button/Form */}
            <div className="add-project-section">
              {!showAddForm ? (
                <>
                  <button
                    type="button"
                    className="add-project-button"
                    onClick={() => setShowAddForm(true)}
                  >
                    + Add Project
                  </button>
                  <p className="add-project-hint">
                    or just launch Claude in a folder and it will automatically
                    appear here
                  </p>
                </>
              ) : (
                <form onSubmit={handleAddProject} className="add-project-form">
                  <input
                    type="text"
                    value={newProjectPath}
                    onChange={(e) => setNewProjectPath(e.target.value)}
                    placeholder="Enter project path (e.g., ~/code/my-project)"
                    disabled={adding}
                  />
                  <div className="add-project-actions">
                    <button
                      type="submit"
                      disabled={adding || !newProjectPath.trim()}
                    >
                      {adding ? "Adding..." : "Add"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setNewProjectPath("");
                        setAddError(null);
                      }}
                      disabled={adding}
                    >
                      Cancel
                    </button>
                  </div>
                  {addError && (
                    <div className="add-project-error">{addError}</div>
                  )}
                </form>
              )}
            </div>

            {projects.length === 0 ? (
              <p>No projects found. Add a project above to get started.</p>
            ) : (
              <ul className="project-list">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link to={`/sessions?project=${project.id}`}>
                      <strong>{project.name}</strong>
                      <span className="meta">
                        {project.sessionCount} sessions
                        <ActiveCountBadge
                          variant="owned"
                          count={project.activeOwnedCount}
                        />
                        <ActiveCountBadge
                          variant="external"
                          count={project.activeExternalCount}
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
