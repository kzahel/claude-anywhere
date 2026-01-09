/**
 * File locking utilities for coordinating access to shared data files
 * across multiple yep-anywhere server instances.
 *
 * Uses proper-lockfile which:
 * - Uses mkdir for atomic lock acquisition (works on local + network FS)
 * - Periodically updates mtime to detect stale locks from crashed processes
 * - Pure JS, no native dependencies
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import lockfile from "proper-lockfile";

export interface FileLockOptions {
  /** Number of retries if lock is held (default: 3) */
  retries?: number;
  /** Lock considered stale after this many ms (default: 10000) */
  stale?: number;
}

/**
 * Execute a function while holding an exclusive lock on a file.
 * Use this for read-modify-write operations on shared files.
 *
 * @example
 * await withFileLock(metadataPath, async () => {
 *   const data = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
 *   data.starred = true;
 *   await fs.writeFile(metadataPath, JSON.stringify(data, null, 2));
 * });
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
  options?: FileLockOptions,
): Promise<T> {
  const release = await lockfile.lock(filePath, {
    stale: options?.stale ?? 10000,
    retries: options?.retries ?? 3,
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}

export interface CacheWriterOptions {
  /** Lock considered stale after this many ms (default: 30000) */
  stale?: number;
  /** Heartbeat interval in ms (default: 10000) */
  update?: number;
}

/**
 * Try to claim exclusive cache writer rights for this process.
 * Only one process should write cache/index files to avoid conflicts.
 *
 * Returns a release function if lock acquired, null if another process holds it.
 * The lock is maintained via periodic heartbeat until released or process exits.
 *
 * @example
 * const release = await tryClaimCacheWriter(dataDir);
 * if (release) {
 *   console.log('I am the cache writer');
 *   // Write cache files...
 *   // On shutdown: await release();
 * } else {
 *   console.log('Another process is the cache writer');
 * }
 */
export async function tryClaimCacheWriter(
  dataDir: string,
  options?: CacheWriterOptions,
): Promise<(() => Promise<void>) | null> {
  const sentinelPath = path.join(dataDir, "cache-writer.sentinel");

  // Ensure data dir and sentinel file exist (lockfile needs the file to exist)
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.writeFile(sentinelPath, "", { flag: "wx" }); // create only if not exists
  } catch (e) {
    // File already exists, that's fine
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
      throw e;
    }
  }

  try {
    const release = await lockfile.lock(sentinelPath, {
      stale: options?.stale ?? 30000,
      update: options?.update ?? 10000,
      retries: 0, // Don't wait, fail immediately if held
    });
    return release;
  } catch {
    // Lock held by another process (or other error - treat as "can't acquire")
    return null;
  }
}

/**
 * Check if a file is currently locked.
 * Useful for diagnostics/testing.
 */
export async function isFileLocked(filePath: string): Promise<boolean> {
  try {
    return await lockfile.check(filePath);
  } catch {
    return false;
  }
}
