#!/usr/bin/env npx tsx
/**
 * Classify tool use errors from Claude session files.
 *
 * Scans all .jsonl session files in ~/.claude/projects/ and categorizes
 * tool errors to help understand patterns for UI rendering.
 *
 * Usage:
 *   npx tsx scripts/classify-tool-errors.ts
 *   npx tsx scripts/classify-tool-errors.ts --verbose
 *   npx tsx scripts/classify-tool-errors.ts --json
 */

import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface ToolError {
  toolName: string;
  content: string;
  toolUseResult?: string;
  sessionFile: string;
  classification: ErrorClassification;
}

type ErrorClassification =
  | "user_rejection" // User explicitly rejected the tool call
  | "user_rejection_with_reason" // User rejected with a custom reason
  | "command_failure" // Exit code non-zero
  | "file_error" // File not found, permission denied, modified since read
  | "validation_error" // Schema validation, input validation
  | "timeout" // Operation timed out
  | "network_error" // Network/fetch failures
  | "unknown"; // Can't classify

interface ClassificationResult {
  classification: ErrorClassification;
  confidence: "high" | "medium" | "low";
  reason: string;
}

/**
 * Patterns for classifying error messages
 */
const PATTERNS: Array<{
  pattern: RegExp;
  classification: ErrorClassification;
  confidence: "high" | "medium" | "low";
  reason: string;
}> = [
  // User rejections - high confidence
  {
    pattern: /^User denied permission\.?$/i,
    classification: "user_rejection",
    confidence: "high",
    reason: "Default denial message",
  },
  {
    pattern: /^User did not (approve|allow|permit)/i,
    classification: "user_rejection",
    confidence: "high",
    reason: "User did not approve pattern",
  },
  {
    pattern: /^Permission denied by user/i,
    classification: "user_rejection",
    confidence: "high",
    reason: "Permission denied by user",
  },
  {
    pattern: /^Rejected by user/i,
    classification: "user_rejection",
    confidence: "high",
    reason: "Rejected by user prefix",
  },
  {
    pattern: /^The user doesn't want to proceed/i,
    classification: "user_rejection",
    confidence: "high",
    reason: "User doesn't want to proceed",
  },
  {
    pattern: /^The user doesn't want to take this action/i,
    classification: "user_rejection",
    confidence: "high",
    reason: "User doesn't want to take action",
  },
  {
    pattern: /^\[Request interrupted by user/i,
    classification: "user_rejection",
    confidence: "high",
    reason: "Request interrupted by user",
  },
  {
    pattern: /^User cancelled/i,
    classification: "user_rejection",
    confidence: "high",
    reason: "User cancelled",
  },
  {
    pattern: /^Plan mode - tools not executed/i,
    classification: "user_rejection",
    confidence: "high",
    reason: "Plan mode - tools not executed",
  },

  // Command failures - high confidence
  {
    pattern: /^Exit code [1-9]\d*/,
    classification: "command_failure",
    confidence: "high",
    reason: "Exit code pattern",
  },
  {
    pattern: /ELIFECYCLE.*Command failed/,
    classification: "command_failure",
    confidence: "high",
    reason: "pnpm/npm command failure",
  },
  {
    pattern: /command not found/i,
    classification: "command_failure",
    confidence: "high",
    reason: "Command not found",
  },

  // File errors - high confidence
  {
    pattern: /<tool_use_error>.*File has been modified since read/i,
    classification: "file_error",
    confidence: "high",
    reason: "File modified since read",
  },
  {
    pattern: /^File has been unexpectedly modified/i,
    classification: "file_error",
    confidence: "high",
    reason: "File unexpectedly modified",
  },
  {
    pattern: /<tool_use_error>.*File has not been read yet/i,
    classification: "file_error",
    confidence: "high",
    reason: "File not read yet",
  },
  {
    pattern: /<tool_use_error>.*File does not exist/i,
    classification: "file_error",
    confidence: "high",
    reason: "File does not exist",
  },
  {
    pattern: /<tool_use_error>.*No such file or directory/i,
    classification: "file_error",
    confidence: "high",
    reason: "File not found",
  },
  {
    pattern: /<tool_use_error>.*Permission denied/i,
    classification: "file_error",
    confidence: "high",
    reason: "File permission denied",
  },
  {
    pattern: /ENOENT/,
    classification: "file_error",
    confidence: "high",
    reason: "ENOENT error code",
  },
  {
    pattern: /EACCES/,
    classification: "file_error",
    confidence: "high",
    reason: "EACCES error code",
  },

  // Validation errors
  {
    pattern: /<tool_use_error>.*old_string.*not found/i,
    classification: "validation_error",
    confidence: "high",
    reason: "Edit old_string not found",
  },
  {
    pattern: /<tool_use_error>.*not unique/i,
    classification: "validation_error",
    confidence: "high",
    reason: "Edit string not unique",
  },
  {
    pattern: /<tool_use_error>.*Found \d+ matches.*replace_all is false/i,
    classification: "validation_error",
    confidence: "high",
    reason: "Multiple matches, replace_all not set",
  },
  {
    pattern: /<tool_use_error>.*InputValidationError/i,
    classification: "validation_error",
    confidence: "high",
    reason: "Input validation error",
  },
  {
    pattern: /Invalid (input|parameter|argument)/i,
    classification: "validation_error",
    confidence: "medium",
    reason: "Invalid input pattern",
  },

  // Network/API errors
  {
    pattern: /^Request failed with status code/i,
    classification: "network_error",
    confidence: "high",
    reason: "HTTP status code error",
  },
  {
    pattern: /ECONNREFUSED/,
    classification: "network_error",
    confidence: "high",
    reason: "Connection refused",
  },
  {
    pattern: /ENOTFOUND/,
    classification: "network_error",
    confidence: "high",
    reason: "DNS not found",
  },
  {
    pattern: /fetch failed/i,
    classification: "network_error",
    confidence: "medium",
    reason: "Fetch failed",
  },
  {
    pattern: /Tool permission request failed/i,
    classification: "network_error",
    confidence: "high",
    reason: "Tool permission stream closed",
  },

  // Timeout errors
  {
    pattern: /timed? ?out/i,
    classification: "timeout",
    confidence: "high",
    reason: "Timeout pattern",
  },
  {
    pattern: /ETIMEDOUT/,
    classification: "timeout",
    confidence: "high",
    reason: "ETIMEDOUT error code",
  },

  // Process/shell errors
  {
    pattern: /Shell \d+ is not running/i,
    classification: "command_failure",
    confidence: "high",
    reason: "Shell not running",
  },
  {
    pattern: /<tool_use_error>.*No shell found/i,
    classification: "command_failure",
    confidence: "high",
    reason: "Shell not found",
  },

  // More validation errors
  {
    pattern:
      /<tool_use_error>.*No changes to make.*old_string and new_string are exactly the same/i,
    classification: "validation_error",
    confidence: "high",
    reason: "No changes - strings identical",
  },
  {
    pattern: /No plan file found/i,
    classification: "file_error",
    confidence: "high",
    reason: "Plan file not found",
  },
  {
    pattern: /<tool_use_error>.*Path does not exist/i,
    classification: "file_error",
    confidence: "high",
    reason: "Path does not exist",
  },
  {
    pattern: /<tool_use_error>.*String to replace not found/i,
    classification: "validation_error",
    confidence: "high",
    reason: "String to replace not found",
  },
  {
    pattern: /File content.*exceeds maximum/i,
    classification: "validation_error",
    confidence: "high",
    reason: "File too large",
  },
  {
    pattern: /<tool_use_error>.*exceeds maximum allowed/i,
    classification: "validation_error",
    confidence: "high",
    reason: "Content exceeds limit",
  },
  {
    pattern: /Agent type .* not found/i,
    classification: "validation_error",
    confidence: "high",
    reason: "Unknown agent type",
  },
  {
    pattern: /<tool_use_error>.*No task found/i,
    classification: "command_failure",
    confidence: "high",
    reason: "Task not found",
  },
];

/**
 * Heuristics for detecting user rejections with custom reasons
 */
function looksLikeUserRejection(content: string): ClassificationResult | null {
  // Strip "Error: " prefix if present
  const stripped = content.replace(/^Error:\s*/i, "").trim();

  // Very short messages that don't match system patterns are likely user rejections
  if (stripped.length < 100) {
    // Check it's not a system error pattern
    const hasSystemPattern =
      /exit code|ENOENT|EACCES|<tool_use_error>|command failed|not found|permission denied/i.test(
        stripped,
      );

    if (!hasSystemPattern) {
      // Check if it looks like human-written text (has spaces, no special chars)
      const looksHuman =
        /^[a-zA-Z]/.test(stripped) && // Starts with letter
        stripped.includes(" ") && // Has spaces
        !/^[A-Z_]+:/.test(stripped) && // Doesn't start with ERROR: or similar
        !/\n.*\n/.test(stripped); // Single line or simple

      if (looksHuman) {
        return {
          classification: "user_rejection_with_reason",
          confidence: "medium",
          reason: "Short human-like message",
        };
      }
    }
  }

  return null;
}

function classifyError(content: string): ClassificationResult {
  // Check patterns first
  for (const { pattern, classification, confidence, reason } of PATTERNS) {
    if (pattern.test(content)) {
      return { classification, confidence, reason };
    }
  }

  // Check heuristics for user rejections
  const userRejection = looksLikeUserRejection(content);
  if (userRejection) {
    return userRejection;
  }

  return {
    classification: "unknown",
    confidence: "low",
    reason: "No pattern matched",
  };
}

async function* findJsonlFiles(dir: string): AsyncGenerator<string> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* findJsonlFiles(fullPath);
      } else if (
        entry.name.endsWith(".jsonl") &&
        !entry.name.startsWith("agent-")
      ) {
        yield fullPath;
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }
}

async function extractErrors(filePath: string): Promise<ToolError[]> {
  const errors: ToolError[] = [];

  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n");

    for (const line of lines) {
      try {
        const msg = JSON.parse(line);

        // Look for tool_result blocks with is_error: true
        if (msg.type === "user" && msg.message?.content) {
          const blocks = Array.isArray(msg.message.content)
            ? msg.message.content
            : [];

          for (const block of blocks) {
            if (block.type === "tool_result" && block.is_error === true) {
              const errorContent = block.content || "";
              const classification = classifyError(errorContent);

              // Try to find the tool name from the corresponding tool_use
              // For now, we'll leave it as unknown since we'd need to search backwards
              errors.push({
                toolName: "unknown",
                content: errorContent,
                toolUseResult: msg.toolUseResult,
                sessionFile: filePath,
                classification: classification.classification,
              });
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File not readable
  }

  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose") || args.includes("-v");
  const jsonOutput = args.includes("--json");

  const claudeDir = join(homedir(), ".claude", "projects");
  const allErrors: ToolError[] = [];

  // Collect all errors
  for await (const file of findJsonlFiles(claudeDir)) {
    const errors = await extractErrors(file);
    allErrors.push(...errors);
  }

  // Group by classification
  const byClassification = new Map<ErrorClassification, ToolError[]>();
  for (const error of allErrors) {
    const existing = byClassification.get(error.classification) || [];
    existing.push(error);
    byClassification.set(error.classification, existing);
  }

  if (jsonOutput) {
    // Output as JSON for further processing
    const summary = {
      total: allErrors.length,
      byClassification: Object.fromEntries(
        [...byClassification.entries()].map(([k, v]) => [
          k,
          {
            count: v.length,
            examples: v.slice(0, 3).map((e) => ({
              content: e.content.slice(0, 200),
              toolUseResult: e.toolUseResult?.slice(0, 200),
            })),
          },
        ]),
      ),
    };
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  // Print summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("Tool Error Classification Summary");
  console.log(`${"=".repeat(60)}\n`);
  console.log(`Total errors found: ${allErrors.length}\n`);

  const classifications: ErrorClassification[] = [
    "user_rejection",
    "user_rejection_with_reason",
    "command_failure",
    "file_error",
    "validation_error",
    "timeout",
    "network_error",
    "unknown",
  ];

  for (const classification of classifications) {
    const errors = byClassification.get(classification) || [];
    if (errors.length === 0) continue;

    const pct = ((errors.length / allErrors.length) * 100).toFixed(1);
    console.log(`\n${classification} (${errors.length} - ${pct}%)`);
    console.log("-".repeat(40));

    if (verbose) {
      // Show all unique error messages
      const unique = new Map<string, number>();
      for (const e of errors) {
        const key = e.content.slice(0, 150);
        unique.set(key, (unique.get(key) || 0) + 1);
      }

      const sorted = [...unique.entries()].sort((a, b) => b[1] - a[1]);
      for (const [msg, count] of sorted.slice(0, 10)) {
        console.log(`  [${count}x] ${msg}...`);
      }
    } else {
      // Show just a few examples
      const examples = errors.slice(0, 3);
      for (const e of examples) {
        const preview = e.content.slice(0, 80).replace(/\n/g, "\\n");
        console.log(`  • ${preview}...`);
      }
      if (errors.length > 3) {
        console.log(`  ... and ${errors.length - 3} more`);
      }
    }
  }

  // Print classification recommendations
  console.log(`\n${"=".repeat(60)}`);
  console.log("Rendering Recommendations");
  console.log(`${"=".repeat(60)}\n`);

  const userRejections =
    (byClassification.get("user_rejection")?.length || 0) +
    (byClassification.get("user_rejection_with_reason")?.length || 0);
  const systemErrors = allErrors.length - userRejections;

  console.log(
    `User rejections: ${userRejections} (${((userRejections / allErrors.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `System errors: ${systemErrors} (${((systemErrors / allErrors.length) * 100).toFixed(1)}%)`,
  );
  console.log("\nSuggested UI treatment:");
  console.log(`  • user_rejection: "Declined" badge, muted gray styling`);
  console.log(
    `  • user_rejection_with_reason: "Declined" badge + show reason, muted styling`,
  );
  console.log(
    `  • command_failure: "Exit code X" badge, amber/warning styling`,
  );
  console.log(`  • file_error: "File error" badge, amber styling`);
  console.log(`  • validation_error: "Invalid" badge, amber styling`);
  console.log("  • timeout/network_error: Specific badge, amber styling");
  console.log(`  • unknown: "Error" badge, amber styling (not red)`);
}

main().catch(console.error);
