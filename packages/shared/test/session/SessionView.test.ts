import { describe, expect, it } from "vitest";
import {
  SessionView,
  getSessionDisplayTitle,
  SESSION_TITLE_MAX_LENGTH,
} from "../../src/session/SessionView.js";
import type { AppSessionSummary } from "../../src/app-types.js";

describe("SessionView", () => {
  describe("constructor", () => {
    it("creates instance with all properties", () => {
      const view = new SessionView(
        "session-123",
        "Auto title",
        "Full auto title that is longer",
        "Custom title",
      );

      expect(view.id).toBe("session-123");
      expect(view.autoTitle).toBe("Auto title");
      expect(view.fullTitle).toBe("Full auto title that is longer");
      expect(view.customTitle).toBe("Custom title");
    });

    it("allows null titles", () => {
      const view = new SessionView("session-123", null, null);

      expect(view.autoTitle).toBeNull();
      expect(view.fullTitle).toBeNull();
      expect(view.customTitle).toBeUndefined();
    });
  });

  describe("displayTitle", () => {
    it("returns customTitle when set", () => {
      const view = new SessionView(
        "session-123",
        "Auto title",
        "Full title",
        "Custom title",
      );

      expect(view.displayTitle).toBe("Custom title");
    });

    it("returns autoTitle when no customTitle", () => {
      const view = new SessionView("session-123", "Auto title", "Full title");

      expect(view.displayTitle).toBe("Auto title");
    });

    it("returns 'Untitled' when no titles", () => {
      const view = new SessionView("session-123", null, null);

      expect(view.displayTitle).toBe("Untitled");
    });

    it("prefers customTitle over autoTitle", () => {
      const view = new SessionView(
        "session-123",
        "Auto title",
        "Full title",
        "My custom name",
      );

      expect(view.displayTitle).toBe("My custom name");
    });
  });

  describe("hasCustomTitle", () => {
    it("returns true when customTitle is set", () => {
      const view = new SessionView(
        "session-123",
        "Auto",
        "Full",
        "Custom",
      );

      expect(view.hasCustomTitle).toBe(true);
    });

    it("returns false when customTitle is undefined", () => {
      const view = new SessionView("session-123", "Auto", "Full");

      expect(view.hasCustomTitle).toBe(false);
    });

    it("returns false when customTitle is empty string", () => {
      const view = new SessionView("session-123", "Auto", "Full", "");

      expect(view.hasCustomTitle).toBe(false);
    });
  });

  describe("tooltipTitle", () => {
    it("returns fullTitle when available", () => {
      const view = new SessionView(
        "session-123",
        "Short title",
        "This is the full title with more details",
      );

      expect(view.tooltipTitle).toBe("This is the full title with more details");
    });

    it("falls back to autoTitle when fullTitle is null", () => {
      const view = new SessionView("session-123", "Auto title", null);

      expect(view.tooltipTitle).toBe("Auto title");
    });

    it("returns null when both are null", () => {
      const view = new SessionView("session-123", null, null);

      expect(view.tooltipTitle).toBeNull();
    });
  });

  describe("isTruncated", () => {
    it("returns true when autoTitle differs from fullTitle", () => {
      const view = new SessionView(
        "session-123",
        "Short...",
        "Short title that was truncated",
      );

      expect(view.isTruncated).toBe(true);
    });

    it("returns false when autoTitle equals fullTitle", () => {
      const view = new SessionView(
        "session-123",
        "Same title",
        "Same title",
      );

      expect(view.isTruncated).toBe(false);
    });

    it("returns false when autoTitle is null", () => {
      const view = new SessionView("session-123", null, "Full title");

      expect(view.isTruncated).toBe(false);
    });

    it("returns false when fullTitle is null", () => {
      const view = new SessionView("session-123", "Auto title", null);

      expect(view.isTruncated).toBe(false);
    });
  });

  describe("from", () => {
    it("creates SessionView from AppSessionSummary", () => {
      const summary: AppSessionSummary = {
        id: "session-456",
        projectId: "project-123" as any,
        title: "Auto title",
        fullTitle: "Full auto title",
        customTitle: "Custom name",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
        messageCount: 10,
        status: { state: "idle" },
      };

      const view = SessionView.from(summary);

      expect(view.id).toBe("session-456");
      expect(view.autoTitle).toBe("Auto title");
      expect(view.fullTitle).toBe("Full auto title");
      expect(view.customTitle).toBe("Custom name");
      expect(view.displayTitle).toBe("Custom name");
    });

    it("handles summary without customTitle", () => {
      const summary: AppSessionSummary = {
        id: "session-789",
        projectId: "project-123" as any,
        title: "Auto title",
        fullTitle: "Full title",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
        messageCount: 5,
        status: { state: "idle" },
      };

      const view = SessionView.from(summary);

      expect(view.customTitle).toBeUndefined();
      expect(view.displayTitle).toBe("Auto title");
    });
  });

  describe("fromPartial", () => {
    it("creates SessionView from partial data", () => {
      const view = SessionView.fromPartial({
        id: "session-123",
        title: "Auto",
        customTitle: "Custom",
      });

      expect(view.id).toBe("session-123");
      expect(view.autoTitle).toBe("Auto");
      expect(view.fullTitle).toBeNull();
      expect(view.customTitle).toBe("Custom");
    });

    it("handles minimal data", () => {
      const view = SessionView.fromPartial({ id: "session-123" });

      expect(view.id).toBe("session-123");
      expect(view.autoTitle).toBeNull();
      expect(view.fullTitle).toBeNull();
      expect(view.customTitle).toBeUndefined();
      expect(view.displayTitle).toBe("Untitled");
    });
  });
});

describe("getSessionDisplayTitle", () => {
  it("returns customTitle when set", () => {
    expect(
      getSessionDisplayTitle({ customTitle: "Custom", title: "Auto" }),
    ).toBe("Custom");
  });

  it("returns title when no customTitle", () => {
    expect(getSessionDisplayTitle({ title: "Auto" })).toBe("Auto");
  });

  it("returns 'Untitled' when no titles", () => {
    expect(getSessionDisplayTitle({})).toBe("Untitled");
  });

  it("returns 'Untitled' for null session", () => {
    expect(getSessionDisplayTitle(null)).toBe("Untitled");
  });

  it("returns 'Untitled' for undefined session", () => {
    expect(getSessionDisplayTitle(undefined)).toBe("Untitled");
  });

  it("handles null title", () => {
    expect(getSessionDisplayTitle({ title: null })).toBe("Untitled");
  });
});

describe("SESSION_TITLE_MAX_LENGTH", () => {
  it("is 120 characters", () => {
    expect(SESSION_TITLE_MAX_LENGTH).toBe(120);
  });
});
