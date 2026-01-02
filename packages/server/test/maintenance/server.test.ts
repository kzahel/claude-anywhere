import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startMaintenanceServer,
  updateConnectionStats,
} from "../../src/maintenance/server.js";

describe("Maintenance Server", () => {
  const port = 13401; // Use high port to avoid conflicts
  let server: ReturnType<typeof startMaintenanceServer>;

  beforeAll(() => {
    server = startMaintenanceServer({ port, mainServerPort: 3400 });
  });

  afterAll(() => {
    server.stop();
  });

  const fetch = async (
    path: string,
    options?: RequestInit,
  ): Promise<Response> => {
    return globalThis.fetch(`http://localhost:${port}${path}`, options);
  };

  describe("GET /health", () => {
    it("returns ok status", async () => {
      const res = await fetch("/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeDefined();
    });
  });

  describe("GET /status", () => {
    it("returns server status", async () => {
      updateConnectionStats({ activeHttpConnections: 5 });

      const res = await fetch("/status");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.uptime).toBeDefined();
      expect(body.memory).toBeDefined();
      expect(body.memory.rss).toBeDefined();
      expect(body.connections.activeHttpConnections).toBe(5);
      expect(body.mainServerPort).toBe(3400);
    });
  });

  describe("GET /log/level", () => {
    it("returns current log levels", async () => {
      const res = await fetch("/log/level");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.console).toBeDefined();
      expect(body.file).toBeDefined();
      expect(body.availableLevels).toContain("debug");
      expect(body.availableLevels).toContain("info");
    });
  });

  describe("PUT /log/level", () => {
    it("accepts valid level and returns response", async () => {
      const res = await fetch("/log/level", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ console: "warn" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      // Verify response structure
      expect(body.console).toBeDefined();
      expect(body.file).toBeDefined();
      expect(body.previous).toBeDefined();
      expect(body.message).toBe("Log levels updated");
    });

    it("rejects invalid level", async () => {
      const res = await fetch("/log/level", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ console: "invalid" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid");
    });

    it("rejects empty body", async () => {
      const res = await fetch("/log/level", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /proxy/debug", () => {
    it("returns proxy debug status", async () => {
      const res = await fetch("/proxy/debug");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(typeof body.enabled).toBe("boolean");
    });
  });

  describe("PUT /proxy/debug", () => {
    it("toggles proxy debug", async () => {
      const res = await fetch("/proxy/debug", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.enabled).toBe(true);
    });

    it("rejects invalid body", async () => {
      const res = await fetch("/proxy/debug", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: "yes" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /inspector", () => {
    it("returns inspector status", async () => {
      const res = await fetch("/inspector");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(typeof body.enabled).toBe("boolean");
    });
  });

  describe("Cross-origin security", () => {
    it("rejects cross-origin requests", async () => {
      const res = await fetch("/health", {
        headers: { Origin: "http://evil.com" },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("allows same-origin requests", async () => {
      const res = await fetch("/health", {
        headers: { Origin: `http://localhost:${port}` },
      });
      expect(res.status).toBe(200);
    });

    it("allows requests without Origin header", async () => {
      // Default fetch doesn't send Origin for same-origin
      const res = await fetch("/health");
      expect(res.status).toBe(200);
    });

    it("rejects OPTIONS preflight", async () => {
      const res = await fetch("/health", { method: "OPTIONS" });
      expect(res.status).toBe(403);
    });
  });

  describe("404 handling", () => {
    it("returns 404 with available endpoints", async () => {
      const res = await fetch("/nonexistent");
      expect(res.status).toBe(404);
      const body = await res.json();

      expect(body.error).toBe("Not found");
      expect(body.availableEndpoints).toContain("GET  /health");
    });
  });
});
