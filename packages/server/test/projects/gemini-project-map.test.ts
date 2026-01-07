import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { GeminiProjectMap } from "../../src/projects/gemini-project-map.js";

describe("GeminiProjectMap", () => {
  let tempDir: string;
  let mapFile: string;
  let projectMap: GeminiProjectMap;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gemini-map-test-"));
    mapFile = join(tempDir, "project-map.json");
    projectMap = new GeminiProjectMap(mapFile);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should initialize with empty map if file doesn't exist", async () => {
    await projectMap.load();
    const hash = await projectMap.get("some-hash");
    expect(hash).toBeUndefined();
  });

  it("should save and load entries", async () => {
    await projectMap.add("hash1", "/path/to/project1");
    // Should persist to disk automatically on add

    // Create new instance to verify persistence
    const newMap = new GeminiProjectMap(mapFile);
    await newMap.load();

    expect(await newMap.get("hash1")).toBe("/path/to/project1");
  });

  it("should update existing entries", async () => {
    await projectMap.add("hash1", "/path/to/project1");
    await projectMap.add("hash1", "/path/to/project1-updated");

    expect(await projectMap.get("hash1")).toBe("/path/to/project1-updated");
  });

  it("should remove entries", async () => {
    await projectMap.add("hash1", "/path/to/project1");
    await projectMap.remove("hash1");

    expect(await projectMap.get("hash1")).toBeUndefined();

    // Verify persistence
    const newMap = new GeminiProjectMap(mapFile);
    await newMap.load();
    expect(await newMap.get("hash1")).toBeUndefined();
  });

  it("should get all entries", async () => {
    await projectMap.add("hash1", "/path/1");
    await projectMap.add("hash2", "/path/2");

    const all = await projectMap.getAll();
    expect(all.get("hash1")).toBe("/path/1");
    expect(all.get("hash2")).toBe("/path/2");
    expect(all.size).toBe(2);
  });

  it("should clean invalid paths", async () => {
    await projectMap.add("hash1", "/path/1");
    await projectMap.add("hash2", "/path/2");

    // Mock validator that rejects path/2
    const validator = async (path: string) => path === "/path/1";

    await projectMap.clean(validator);

    const all = await projectMap.getAll();
    expect(all.size).toBe(1);
    expect(all.get("hash1")).toBe("/path/1");
    expect(all.get("hash2")).toBeUndefined();
  });

  it("should handle corrupted json file gracefully", async () => {
    await writeFile(mapFile, "{ invalid json");

    await projectMap.load();
    // Should load empty map
    const all = await projectMap.getAll();
    expect(all.size).toBe(0);
  });
});
