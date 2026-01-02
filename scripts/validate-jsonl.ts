#!/usr/bin/env npx tsx

/**
 * Validates JSONL session files against our Zod schemas.
 *
 * Usage:
 *   npx tsx scripts/validate-jsonl.ts [path]
 *
 * If no path is provided, validates all sessions in ~/.claude/projects
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SessionEntrySchema } from "../packages/shared/src/claude-sdk-schema/index.js";

interface ValidationError {
  file: string;
  lineNumber: number;
  error: string;
  rawLine: string;
}

interface ValidationResult {
  file: string;
  totalLines: number;
  validLines: number;
  errors: ValidationError[];
}

function findJsonlFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Skip directories we can't read
    }
  }

  walk(dir);
  return files;
}

function validateFile(filePath: string): ValidationResult {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim() !== "");

  const result: ValidationResult = {
    file: filePath,
    totalLines: lines.length,
    validLines: 0,
    errors: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    try {
      const parsed = JSON.parse(line);
      const validated = SessionEntrySchema.safeParse(parsed);

      if (validated.success) {
        result.validLines++;
      } else {
        // Use .issues for Zod errors
        const errorMessages = validated.error.issues.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        );
        result.errors.push({
          file: filePath,
          lineNumber,
          error: errorMessages.join("; "),
          rawLine: line.length > 200 ? `${line.slice(0, 200)}...` : line,
        });
      }
    } catch (parseError) {
      result.errors.push({
        file: filePath,
        lineNumber,
        error: `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        rawLine: line.length > 200 ? `${line.slice(0, 200)}...` : line,
      });
    }
  }

  return result;
}

function main() {
  const args = process.argv.slice(2);
  let targetPath: string;

  if (args.length > 0) {
    targetPath = args[0];
  } else {
    targetPath = path.join(os.homedir(), ".claude", "projects");
  }

  if (!fs.existsSync(targetPath)) {
    console.error(`Path does not exist: ${targetPath}`);
    process.exit(1);
  }

  let files: string[];
  if (fs.statSync(targetPath).isDirectory()) {
    files = findJsonlFiles(targetPath);
  } else {
    files = [targetPath];
  }

  if (files.length === 0) {
    console.log("No .jsonl files found");
    process.exit(0);
  }

  console.log(`Found ${files.length} JSONL file(s)\n`);

  let totalFiles = 0;
  let totalLines = 0;
  let totalValid = 0;
  let totalErrors = 0;
  const allErrors: ValidationError[] = [];

  for (const file of files) {
    const result = validateFile(file);
    totalFiles++;
    totalLines += result.totalLines;
    totalValid += result.validLines;
    totalErrors += result.errors.length;
    allErrors.push(...result.errors);

    const status =
      result.errors.length === 0 ? "✓" : `✗ (${result.errors.length} errors)`;
    console.log(
      `${status} ${path.relative(process.cwd(), file)} - ${result.validLines}/${result.totalLines} valid`,
    );
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `Summary: ${totalValid}/${totalLines} lines valid across ${totalFiles} files`,
  );

  if (allErrors.length > 0) {
    console.log(`\nErrors (${allErrors.length} total):\n`);

    // Group errors by error message to find patterns
    const errorPatterns = new Map<string, ValidationError[]>();
    for (const error of allErrors) {
      const key = error.error;
      if (!errorPatterns.has(key)) {
        errorPatterns.set(key, []);
      }
      errorPatterns.get(key)?.push(error);
    }

    // Show unique error patterns with counts
    const sortedPatterns = [...errorPatterns.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    );

    for (const [errorMsg, errors] of sortedPatterns.slice(0, 20)) {
      console.log(`[${errors.length}x] ${errorMsg}`);
      // Show one example
      const example = errors[0];
      console.log(
        `     Example: ${path.basename(example.file)}:${example.lineNumber}`,
      );
      console.log("");
    }

    if (sortedPatterns.length > 20) {
      console.log(`... and ${sortedPatterns.length - 20} more error patterns`);
    }

    process.exit(1);
  }

  console.log("\nAll lines validated successfully!");
}

main();
