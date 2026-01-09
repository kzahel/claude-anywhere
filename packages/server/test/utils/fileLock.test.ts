import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isFileLocked,
  tryClaimCacheWriter,
  withFileLock,
} from "../../src/utils/fileLock.js";

describe("fileLock", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `file-lock-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("withFileLock", () => {
    it("executes function and returns result", async () => {
      const testFile = join(testDir, "test.json");
      await writeFile(testFile, "{}");

      const result = await withFileLock(testFile, async () => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it("provides exclusive access during execution", async () => {
      const testFile = join(testDir, "test.json");
      await writeFile(testFile, JSON.stringify({ count: 0 }));

      const executionOrder: string[] = [];

      // Start two concurrent operations
      const [result1, result2] = await Promise.all([
        withFileLock(testFile, async () => {
          executionOrder.push("start-1");
          // Simulate some work
          await new Promise((r) => setTimeout(r, 50));
          executionOrder.push("end-1");
          return 1;
        }),
        withFileLock(testFile, async () => {
          executionOrder.push("start-2");
          await new Promise((r) => setTimeout(r, 50));
          executionOrder.push("end-2");
          return 2;
        }),
      ]);

      expect(result1).toBe(1);
      expect(result2).toBe(2);

      // One should complete before the other starts
      // Either [start-1, end-1, start-2, end-2] or [start-2, end-2, start-1, end-1]
      const firstEnded =
        executionOrder.indexOf("end-1") < executionOrder.indexOf("end-2")
          ? 1
          : 2;
      const secondStarted = executionOrder.indexOf(
        `start-${firstEnded === 1 ? 2 : 1}`,
      );
      const firstEndsAt = executionOrder.indexOf(`end-${firstEnded}`);

      expect(secondStarted).toBeGreaterThan(firstEndsAt);
    });

    it("releases lock on error", async () => {
      const testFile = join(testDir, "test.json");
      await writeFile(testFile, "{}");

      await expect(
        withFileLock(testFile, async () => {
          throw new Error("test error");
        }),
      ).rejects.toThrow("test error");

      // Lock should be released - we can acquire it again
      const result = await withFileLock(testFile, async () => "success");
      expect(result).toBe("success");
    });

    it("supports read-modify-write pattern", async () => {
      const testFile = join(testDir, "counter.json");
      await writeFile(testFile, JSON.stringify({ count: 0 }));

      // Concurrent increments
      await Promise.all([
        withFileLock(testFile, async () => {
          const data = JSON.parse(await readFile(testFile, "utf-8"));
          data.count += 1;
          await writeFile(testFile, JSON.stringify(data));
        }),
        withFileLock(testFile, async () => {
          const data = JSON.parse(await readFile(testFile, "utf-8"));
          data.count += 1;
          await writeFile(testFile, JSON.stringify(data));
        }),
        withFileLock(testFile, async () => {
          const data = JSON.parse(await readFile(testFile, "utf-8"));
          data.count += 1;
          await writeFile(testFile, JSON.stringify(data));
        }),
      ]);

      const final = JSON.parse(await readFile(testFile, "utf-8"));
      expect(final.count).toBe(3);
    });

    it("retries on lock contention", async () => {
      const testFile = join(testDir, "test.json");
      await writeFile(testFile, "{}");

      let attempts = 0;

      // Hold lock in background
      const holdLock = withFileLock(testFile, async () => {
        await new Promise((r) => setTimeout(r, 100));
        return "holder";
      });

      // Try to acquire with retries
      const tryAcquire = withFileLock(
        testFile,
        async () => {
          attempts++;
          return "acquired";
        },
        { retries: 5 },
      );

      const [holderResult, acquireResult] = await Promise.all([
        holdLock,
        tryAcquire,
      ]);

      expect(holderResult).toBe("holder");
      expect(acquireResult).toBe("acquired");
    });
  });

  describe("tryClaimCacheWriter", () => {
    it("returns release function when lock acquired", async () => {
      const release = await tryClaimCacheWriter(testDir);

      expect(release).not.toBeNull();
      expect(typeof release).toBe("function");

      await release?.();
    });

    it("creates sentinel file in data directory", async () => {
      const release = await tryClaimCacheWriter(testDir);

      const sentinelPath = join(testDir, "cache-writer.sentinel");
      const exists = await readFile(sentinelPath, "utf-8").then(
        () => true,
        () => false,
      );

      expect(exists).toBe(true);

      await release?.();
    });

    it("returns null when another process holds lock", async () => {
      // First caller gets the lock
      const release1 = await tryClaimCacheWriter(testDir);
      expect(release1).not.toBeNull();

      // Second caller should fail immediately
      const release2 = await tryClaimCacheWriter(testDir);
      expect(release2).toBeNull();

      // Clean up
      await release1?.();
    });

    it("allows re-acquisition after release", async () => {
      const release1 = await tryClaimCacheWriter(testDir);
      expect(release1).not.toBeNull();

      await release1?.();

      // Should be able to acquire again
      const release2 = await tryClaimCacheWriter(testDir);
      expect(release2).not.toBeNull();

      await release2?.();
    });

    it("creates data directory if it doesn't exist", async () => {
      const nestedDir = join(testDir, "nested", "data", "dir");

      const release = await tryClaimCacheWriter(nestedDir);
      expect(release).not.toBeNull();

      const sentinelPath = join(nestedDir, "cache-writer.sentinel");
      const exists = await readFile(sentinelPath, "utf-8").then(
        () => true,
        () => false,
      );
      expect(exists).toBe(true);

      await release?.();
    });

    it("uses custom stale and update options", async () => {
      // Just verify it doesn't throw with custom options
      const release = await tryClaimCacheWriter(testDir, {
        stale: 60000,
        update: 20000,
      });

      expect(release).not.toBeNull();
      await release?.();
    });
  });

  describe("isFileLocked", () => {
    it("returns false for unlocked file", async () => {
      const testFile = join(testDir, "test.json");
      await writeFile(testFile, "{}");

      const locked = await isFileLocked(testFile);
      expect(locked).toBe(false);
    });

    it("returns true for locked file", async () => {
      const testFile = join(testDir, "test.json");
      await writeFile(testFile, "{}");

      await withFileLock(testFile, async () => {
        const locked = await isFileLocked(testFile);
        expect(locked).toBe(true);
      });
    });

    it("returns false for non-existent file", async () => {
      const testFile = join(testDir, "nonexistent.json");

      const locked = await isFileLocked(testFile);
      expect(locked).toBe(false);
    });
  });
});
