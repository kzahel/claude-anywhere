import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { initializeFontSize } from "./hooks/useFontSize";
import { initializeTheme } from "./hooks/useTheme";
import { NavigationLayout, ProjectLayout } from "./layouts";
import { activityBus } from "./lib/activityBus";
import { ActivityPage } from "./pages/ActivityPage";
import { AgentsPage } from "./pages/AgentsPage";
import { FilePage } from "./pages/FilePage";
import { InboxPage } from "./pages/InboxPage";
import { NewSessionPage } from "./pages/NewSessionPage";
import { ProjectInboxPage } from "./pages/ProjectInboxPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SessionPage } from "./pages/SessionPage";
import { SessionsPage } from "./pages/SessionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import "./styles/index.css";

// Apply saved preferences before React renders to avoid flash
initializeTheme();
initializeFontSize();

// Connect to SSE activity stream (single connection for entire app)
activityBus.connect();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          {/* Top-level navigation pages share NavigationLayout */}
          <Route element={<NavigationLayout />}>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          {/* Project pages use ProjectLayout with project-specific sidebar */}
          <Route path="/projects/:projectId" element={<ProjectLayout />}>
            <Route index element={<SessionsPage />} />
            <Route path="new-session" element={<NewSessionPage />} />
            <Route path="sessions/:sessionId" element={<SessionPage />} />
            <Route path="file" element={<FilePage />} />
            <Route path="inbox" element={<ProjectInboxPage />} />
          </Route>
          {/* Activity page has its own layout */}
          <Route path="/activity" element={<ActivityPage />} />
        </Routes>
      </App>
    </BrowserRouter>
  </StrictMode>,
);
