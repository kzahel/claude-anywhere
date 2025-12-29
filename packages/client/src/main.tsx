import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ActivityDrawer } from "./components/ActivityDrawer";
import { ActivityDrawerProvider } from "./context/ActivityDrawerContext";
import { ActivityPage } from "./pages/ActivityPage";
import { ChatPage } from "./pages/ChatPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SessionsPage } from "./pages/SessionsPage";
import "./styles/index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <ActivityDrawerProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<SessionsPage />} />
          <Route
            path="/projects/:projectId/sessions/:sessionId"
            element={<ChatPage />}
          />
          <Route path="/activity" element={<ActivityPage />} />
        </Routes>
        <ActivityDrawer />
      </ActivityDrawerProvider>
    </BrowserRouter>
  </StrictMode>,
);
