import { useLayoutEffect, useRef, useState } from "react";
import { useActivityDrawer } from "../context/ActivityDrawerContext";
import {
  type FileChangeEvent,
  useFileActivity,
} from "../hooks/useFileActivity";

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString();
}

function getTypeIcon(type: FileChangeEvent["changeType"]): string {
  switch (type) {
    case "create":
      return "+";
    case "modify":
      return "~";
    case "delete":
      return "-";
  }
}

function getTypeColor(type: FileChangeEvent["changeType"]): string {
  switch (type) {
    case "create":
      return "#4f4";
    case "modify":
      return "#ff4";
    case "delete":
      return "#f44";
  }
}

function getFileTypeLabel(fileType: FileChangeEvent["fileType"]): string {
  switch (fileType) {
    case "session":
      return "session";
    case "agent-session":
      return "agent";
    case "settings":
      return "settings";
    case "credentials":
      return "creds";
    case "telemetry":
      return "telemetry";
    default:
      return "";
  }
}

export function ActivityDrawer() {
  const { isOpen, setIsOpen, drawerHeight } = useActivityDrawer();
  const [filter, setFilter] = useState("");
  const { events, connected, paused, clearEvents, togglePause, filterByPath } =
    useFileActivity();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Events are stored newest-first, reverse for chronological display (oldest at top)
  const filteredEvents = filter ? filterByPath(filter) : events;
  const displayedEvents = [...filteredEvents].reverse();

  // Track scroll position to know if we should auto-scroll
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const threshold = 20; // pixels from bottom to consider "at bottom"
    isAtBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold;
  };

  // Auto-scroll to bottom when new events arrive (if already at bottom)
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (container && isAtBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [displayedEvents.length]);

  return (
    <div
      className="activity-drawer"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#1a1a1a",
        borderTop: "1px solid #333",
        transition: "height 0.2s ease",
        height: `${drawerHeight}px`,
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.5rem 1rem",
          borderBottom: isOpen ? "1px solid #333" : "none",
          cursor: "pointer",
          background: "#222",
        }}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => e.key === "Enter" && setIsOpen(!isOpen)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connected ? "#4f4" : "#f44",
            }}
          />
          <span style={{ fontWeight: "bold", fontSize: "0.875rem" }}>
            Activity
          </span>
          <span style={{ color: "#888", fontSize: "0.75rem" }}>
            ({events.length} events)
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePause();
            }}
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              background: paused ? "#a44" : "#444",
            }}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearEvents();
            }}
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              background: "#444",
            }}
          >
            Clear
          </button>
          <span style={{ fontSize: "1rem" }}>{isOpen ? "▼" : "▲"}</span>
        </div>
      </div>

      {/* Content */}
      {isOpen && (
        <>
          {/* Filter */}
          <div
            style={{ padding: "0.5rem 1rem", borderBottom: "1px solid #333" }}
          >
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by path pattern..."
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                padding: "0.5rem",
                background: "#2a2a2a",
                border: "1px solid #444",
                borderRadius: "4px",
                color: "inherit",
                fontSize: "0.875rem",
              }}
            />
          </div>

          {/* Events list */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflow: "auto",
              fontFamily: "monospace",
              fontSize: "0.75rem",
              background: "#111",
            }}
          >
            {displayedEvents.length === 0 ? (
              <div
                style={{ padding: "1rem", color: "#888", textAlign: "center" }}
              >
                {filter
                  ? "No events match filter"
                  : "Waiting for file changes..."}
              </div>
            ) : (
              displayedEvents.map((event, i) => (
                <div
                  key={`${event.timestamp}-${event.path}-${i}`}
                  style={{
                    padding: "0.25rem 1rem",
                    borderBottom: "1px solid #222",
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ color: "#666", minWidth: "70px" }}>
                    {formatTime(event.timestamp)}
                  </span>
                  <span
                    style={{
                      color: getTypeColor(event.changeType),
                      fontWeight: "bold",
                      minWidth: "12px",
                    }}
                  >
                    {getTypeIcon(event.changeType)}
                  </span>
                  <span
                    style={{
                      color: "#888",
                      minWidth: "50px",
                      fontSize: "0.7rem",
                    }}
                  >
                    {getFileTypeLabel(event.fileType)}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={event.path}
                  >
                    {event.relativePath}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
