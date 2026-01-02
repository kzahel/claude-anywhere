import { useEffect, useState } from "react";
import { NavigationSidebar } from "../components/NavigationSidebar";
import { PageHeader } from "../components/PageHeader";
import { PushNotificationToggle } from "../components/PushNotificationToggle";
import { useSchemaValidationContext } from "../contexts/SchemaValidationContext";
import {
  FONT_SIZES,
  type FontSize,
  getFontSizeLabel,
  useFontSize,
} from "../hooks/useFontSize";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  MODEL_OPTIONS,
  THINKING_LEVEL_OPTIONS,
  useModelSettings,
} from "../hooks/useModelSettings";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { useReloadNotifications } from "../hooks/useReloadNotifications";
import { useSchemaValidation } from "../hooks/useSchemaValidation";
import { useSidebarPreference } from "../hooks/useSidebarPreference";
import { useStreamingEnabled } from "../hooks/useStreamingEnabled";
import { THEMES, type Theme, getThemeLabel, useTheme } from "../hooks/useTheme";

export function SettingsPage() {
  const {
    isManualReloadMode,
    pendingReloads,
    connected,
    reloadBackend,
    reloadFrontend,
    unsafeToRestart,
    workerActivity,
  } = useReloadNotifications();
  const { fontSize, setFontSize } = useFontSize();
  const { theme, setTheme } = useTheme();
  const { streamingEnabled, setStreamingEnabled } = useStreamingEnabled();
  const {
    model,
    setModel,
    thinkingLevel,
    setThinkingLevel,
    thinkingEnabled,
    setThinkingEnabled,
  } = useModelSettings();
  const { canInstall, isInstalled, install } = usePwaInstall();
  const { settings: validationSettings, setEnabled: setValidationEnabled } =
    useSchemaValidation();
  const { ignoredTools, clearIgnoredTools } = useSchemaValidationContext();
  const [restarting, setRestarting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Desktop layout hooks
  const isWideScreen = useMediaQuery("(min-width: 1100px)");
  const { isExpanded, toggleExpanded } = useSidebarPreference();

  // When SSE reconnects after restart, re-enable the button
  useEffect(() => {
    if (restarting && connected) {
      setRestarting(false);
    }
  }, [restarting, connected]);

  const handleRestartServer = async () => {
    setRestarting(true);
    await reloadBackend();
  };

  const handleReloadFrontend = () => {
    reloadFrontend();
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

      {/* Main content wrapper for desktop centering */}
      <div
        className={
          isWideScreen ? "main-content-wrapper" : "main-content-mobile"
        }
      >
        <div
          className={
            isWideScreen
              ? "main-content-constrained"
              : "main-content-mobile-inner"
          }
        >
          <PageHeader
            title="Settings"
            onOpenSidebar={() => setSidebarOpen(true)}
            hideSettingsLink
          />

          <main className="sessions-page-content">
            {/* Only show App section if install is possible or already installed */}
            {(canInstall || isInstalled) && (
              <section className="settings-section">
                <h2>App</h2>
                <div className="settings-group">
                  <div className="settings-item">
                    <div className="settings-item-info">
                      <strong>Install App</strong>
                      <p>
                        {isInstalled
                          ? "Claude Anywhere is installed on your device."
                          : "Add Claude Anywhere to your home screen for quick access."}
                      </p>
                    </div>
                    {isInstalled ? (
                      <span className="settings-status-badge">Installed</span>
                    ) : (
                      <button
                        type="button"
                        className="settings-button"
                        onClick={install}
                      >
                        Install
                      </button>
                    )}
                  </div>
                </div>
              </section>
            )}

            <section className="settings-section">
              <h2>Appearance</h2>
              <div className="settings-group">
                <div className="settings-item">
                  <div className="settings-item-info">
                    <strong>Theme</strong>
                    <p>Choose your preferred color scheme.</p>
                  </div>
                  <div className="font-size-selector">
                    {THEMES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`font-size-option ${theme === t ? "active" : ""}`}
                        onClick={() => setTheme(t)}
                      >
                        {getThemeLabel(t)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-item">
                  <div className="settings-item-info">
                    <strong>Font Size</strong>
                    <p>Adjust the text size throughout the application.</p>
                  </div>
                  <div className="font-size-selector">
                    {FONT_SIZES.map((size) => (
                      <button
                        key={size}
                        type="button"
                        className={`font-size-option ${fontSize === size ? "active" : ""}`}
                        onClick={() => setFontSize(size)}
                      >
                        {getFontSizeLabel(size)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-item">
                  <div className="settings-item-info">
                    <strong>Response Streaming</strong>
                    <p>
                      Show responses as they are generated, token by token.
                      Disable for better performance on slower devices.
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={streamingEnabled}
                      onChange={(e) => setStreamingEnabled(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            </section>

            <section className="settings-section">
              <h2>Model</h2>
              <div className="settings-group">
                <div className="settings-item">
                  <div className="settings-item-info">
                    <strong>Model</strong>
                    <p>Select which Claude model to use for new sessions.</p>
                  </div>
                  <div className="font-size-selector">
                    {MODEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`font-size-option ${model === opt.value ? "active" : ""}`}
                        onClick={() => setModel(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-item">
                  <div className="settings-item-info">
                    <strong>Extended Thinking</strong>
                    <p>
                      Allow the model to "think" before responding. Toggle on to
                      enable deeper reasoning.
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={thinkingEnabled}
                      onChange={(e) => setThinkingEnabled(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="settings-item">
                  <div className="settings-item-info">
                    <strong>Thinking Level</strong>
                    <p>
                      Token budget for thinking. Higher levels enable deeper
                      reasoning but use more tokens.
                    </p>
                  </div>
                  <div className="font-size-selector">
                    {THINKING_LEVEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`font-size-option ${thinkingLevel === opt.value ? "active" : ""}`}
                        onClick={() => setThinkingLevel(opt.value)}
                        title={opt.description}
                      >
                        {opt.label} ({opt.description})
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="settings-section">
              <h2>Notifications</h2>
              <div className="settings-group">
                <PushNotificationToggle />
              </div>
            </section>

            <section className="settings-section">
              <h2>Development</h2>

              <div className="settings-group">
                <div className="settings-item">
                  <div className="settings-item-info">
                    <strong>Schema Validation</strong>
                    <p>
                      Validate tool results against expected schemas. Shows
                      toast notifications and logs errors to console.
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={validationSettings.enabled}
                      onChange={(e) => setValidationEnabled(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                {ignoredTools.length > 0 && (
                  <div className="settings-item">
                    <div className="settings-item-info">
                      <strong>Ignored Tools</strong>
                      <p>
                        Tools with validation errors you chose to ignore. They
                        will not show toast notifications.
                      </p>
                      <div className="ignored-tools-list">
                        {ignoredTools.map((tool) => (
                          <span key={tool} className="ignored-tool-badge">
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="settings-button settings-button-secondary"
                      onClick={clearIgnoredTools}
                    >
                      Clear Ignored
                    </button>
                  </div>
                )}
              </div>

              {isManualReloadMode ? (
                <div className="settings-group">
                  <div className="settings-item">
                    <div className="settings-item-info">
                      <strong>Restart Server</strong>
                      <p>
                        Restart the backend server to pick up code changes.
                        {pendingReloads.backend && (
                          <span className="settings-pending">
                            {" "}
                            (changes pending)
                          </span>
                        )}
                      </p>
                      {unsafeToRestart && (
                        <p className="settings-warning">
                          {workerActivity.activeWorkers} active session
                          {workerActivity.activeWorkers !== 1 ? "s" : ""} will
                          be interrupted
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`settings-button ${unsafeToRestart ? "settings-button-danger" : ""}`}
                      onClick={handleRestartServer}
                      disabled={restarting}
                    >
                      {restarting
                        ? "Restarting..."
                        : unsafeToRestart
                          ? "Restart Anyway"
                          : "Restart Server"}
                    </button>
                  </div>

                  <div className="settings-item">
                    <div className="settings-item-info">
                      <strong>Reload Frontend</strong>
                      <p>
                        Refresh the browser to pick up frontend changes.
                        {pendingReloads.frontend && (
                          <span className="settings-pending">
                            {" "}
                            (changes pending)
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="settings-button"
                      onClick={handleReloadFrontend}
                    >
                      Reload Frontend
                    </button>
                  </div>
                </div>
              ) : (
                <p className="settings-info">
                  Manual reload mode is not enabled. The server automatically
                  restarts when code changes.
                </p>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
