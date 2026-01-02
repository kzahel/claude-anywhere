import {
  AskUserQuestionResultSchema,
  BashOutputResultSchema,
  BashResultSchema,
  EditResultSchema,
  GlobResultSchema,
  GrepResultSchema,
  KillShellResultSchema,
  ReadResultSchema,
  TaskOutputResultSchema,
  TaskResultSchema,
  TodoWriteResultSchema,
  WebFetchResultSchema,
  WebSearchResultSchema,
  WriteResultSchema,
} from "@claude-anywhere/shared";
import type { ZodError, ZodType } from "zod";

export interface ValidationResult {
  valid: boolean;
  errors?: ZodError;
  toolName: string;
}

// Registry of tool schemas
// Add new schemas here as they are created
const toolSchemas: Record<string, ZodType> = {
  Task: TaskResultSchema,
  Bash: BashResultSchema,
  Read: ReadResultSchema,
  Edit: EditResultSchema,
  Write: WriteResultSchema,
  Glob: GlobResultSchema,
  Grep: GrepResultSchema,
  TodoWrite: TodoWriteResultSchema,
  WebSearch: WebSearchResultSchema,
  WebFetch: WebFetchResultSchema,
  AskUserQuestion: AskUserQuestionResultSchema,
  BashOutput: BashOutputResultSchema,
  TaskOutput: TaskOutputResultSchema,
  KillShell: KillShellResultSchema,
};

/**
 * Validate a tool result against its schema.
 * Returns valid: true if no schema exists for the tool (graceful fallback).
 */
export function validateToolResult(
  toolName: string,
  result: unknown,
): ValidationResult {
  const schema = toolSchemas[toolName];

  // No schema for this tool - graceful fallback
  if (!schema) {
    return { valid: true, toolName };
  }

  const parsed = schema.safeParse(result);

  if (parsed.success) {
    return { valid: true, toolName };
  }

  return { valid: false, errors: parsed.error, toolName };
}
