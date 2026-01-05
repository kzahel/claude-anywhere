import { z } from "zod";

/**
 * ContentBlock schema for Task result content
 * Matches the ContentBlock interface in client/src/components/renderers/types.ts
 */
const ContentBlockSchema = z.object({
  type: z.enum(["text", "thinking", "tool_use", "tool_result"]),
  text: z.string().optional(),
  thinking: z.string().optional(),
  signature: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.unknown().optional(),
  tool_use_id: z.string().optional(),
  content: z.string().optional(),
  is_error: z.boolean().optional(),
});

/**
 * Task tool result schema
 * Matches the TaskResult interface in client/src/components/renderers/tools/types.ts
 * Uses .optional() liberally as the SDK may not always provide all fields
 */
export const TaskResultSchema = z.object({
  status: z.enum(["completed", "failed", "timeout"]).optional(),
  prompt: z.string().optional(),
  agentId: z.string().optional(),
  content: z.array(ContentBlockSchema).optional(),
  totalDurationMs: z.number().optional(),
  totalTokens: z.number().optional(),
  totalToolUseCount: z.number().optional(),
});

export type TaskResultValidated = z.infer<typeof TaskResultSchema>;

/**
 * Bash tool result schema
 * Matches the BashResult interface in client/src/components/renderers/tools/types.ts
 */
export const BashResultSchema = z.object({
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  interrupted: z.boolean().optional(),
  isImage: z.boolean().optional(),
  backgroundTaskId: z.string().optional(),
});

export type BashResultValidated = z.infer<typeof BashResultSchema>;

/**
 * Read tool result schemas
 * Matches the ReadResult, TextFile, and ImageFile interfaces
 */
const TextFileSchema = z.object({
  filePath: z.string().optional(),
  content: z.string().optional(),
  numLines: z.number().optional(),
  startLine: z.number().optional(),
  totalLines: z.number().optional(),
});

const ImageFileDimensionsSchema = z.object({
  originalWidth: z.number().optional(),
  originalHeight: z.number().optional(),
  displayWidth: z.number().optional(),
  displayHeight: z.number().optional(),
});

const ImageFileSchema = z.object({
  base64: z.string().optional(),
  type: z.string().optional(),
  originalSize: z.number().optional(),
  dimensions: ImageFileDimensionsSchema.optional(),
});

export const ReadResultSchema = z.object({
  type: z.enum(["text", "image"]).optional(),
  file: z.union([TextFileSchema, ImageFileSchema]).optional(),
});

export type ReadResultValidated = z.infer<typeof ReadResultSchema>;

/**
 * Edit tool result schema
 * Matches the EditResult and PatchHunk interfaces
 *
 * Note: The SDK provides `type` field ("create" for new files, "edit" for modifications)
 * and `originalFile` can be null for new file creation.
 */
const PatchHunkSchema = z.object({
  oldStart: z.number().optional(),
  oldLines: z.number().optional(),
  newStart: z.number().optional(),
  newLines: z.number().optional(),
  lines: z.array(z.string()).optional(),
});

export const EditResultSchema = z.object({
  type: z.enum(["create", "edit", "update"]).optional(),
  filePath: z.string().optional(),
  oldString: z.string().optional(),
  newString: z.string().optional(),
  originalFile: z.string().nullable().optional(),
  replaceAll: z.boolean().optional(),
  userModified: z.boolean().optional(),
  structuredPatch: z.array(PatchHunkSchema).optional(),
});

export type EditResultValidated = z.infer<typeof EditResultSchema>;

/**
 * Write tool result schema
 * Matches the WriteResult interface
 */
export const WriteResultSchema = z.object({
  type: z.literal("text").optional(),
  file: z
    .object({
      filePath: z.string().optional(),
      content: z.string().optional(),
      numLines: z.number().optional(),
      startLine: z.number().optional(),
      totalLines: z.number().optional(),
    })
    .optional(),
});

export type WriteResultValidated = z.infer<typeof WriteResultSchema>;

/**
 * Glob tool result schema
 * Matches the GlobResult interface
 */
export const GlobResultSchema = z.object({
  filenames: z.array(z.string()).optional(),
  durationMs: z.number().optional(),
  numFiles: z.number().optional(),
  truncated: z.boolean().optional(),
});

export type GlobResultValidated = z.infer<typeof GlobResultSchema>;

/**
 * Grep tool result schema
 * Matches the GrepResult interface
 */
export const GrepResultSchema = z.object({
  mode: z.enum(["files_with_matches", "content", "count"]).optional(),
  filenames: z.array(z.string()).optional(),
  numFiles: z.number().optional(),
  content: z.string().optional(),
  numLines: z.number().optional(),
  appliedLimit: z.number().optional(),
});

export type GrepResultValidated = z.infer<typeof GrepResultSchema>;

/**
 * TodoWrite tool result schema
 * Matches the TodoWriteResult and Todo interfaces
 */
const TodoSchema = z.object({
  content: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed"]).optional(),
  activeForm: z.string().optional(),
});

export const TodoWriteResultSchema = z.object({
  oldTodos: z.array(TodoSchema).optional(),
  newTodos: z.array(TodoSchema).optional(),
});

export type TodoWriteResultValidated = z.infer<typeof TodoWriteResultSchema>;

/**
 * WebSearch tool result schema
 *
 * The SDK returns results as an array containing:
 * - Objects with { tool_use_id, content: [{ title, url }, ...] }
 * - Plain strings (summary text extracted from search)
 */
const WebSearchResultItemSchema = z.object({
  tool_use_id: z.string().optional(),
  content: z
    .array(
      z.object({
        title: z.string().optional(),
        url: z.string().optional(),
      }),
    )
    .optional(),
});

export const WebSearchResultSchema = z.object({
  query: z.string().optional(),
  results: z.array(z.union([WebSearchResultItemSchema, z.string()])).optional(),
  durationSeconds: z.number().optional(),
});

export type WebSearchResultValidated = z.infer<typeof WebSearchResultSchema>;

/**
 * WebFetch tool result schema
 * Matches the WebFetchResult interface
 */
export const WebFetchResultSchema = z.object({
  bytes: z.number().optional(),
  code: z.number().optional(),
  codeText: z.string().optional(),
  result: z.string().optional(),
  durationMs: z.number().optional(),
  url: z.string().optional(),
});

export type WebFetchResultValidated = z.infer<typeof WebFetchResultSchema>;

/**
 * AskUserQuestion tool result schema
 * Matches the AskUserQuestionResult and Question interfaces
 */
const QuestionOptionSchema = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
});

const QuestionSchema = z.object({
  question: z.string().optional(),
  header: z.string().optional(),
  options: z.array(QuestionOptionSchema).optional(),
  multiSelect: z.boolean().optional(),
});

export const AskUserQuestionResultSchema = z.object({
  questions: z.array(QuestionSchema).optional(),
  answers: z.record(z.string(), z.string()).optional(),
});

export type AskUserQuestionResultValidated = z.infer<
  typeof AskUserQuestionResultSchema
>;

/**
 * BashOutput tool result schema
 * Matches the BashOutputResult interface
 */
export const BashOutputResultSchema = z.object({
  shellId: z.string().optional(),
  command: z.string().optional(),
  status: z.enum(["running", "completed", "failed"]).optional(),
  exitCode: z.number().nullable().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  stdoutLines: z.number().optional(),
  stderrLines: z.number().optional(),
  timestamp: z.string().optional(),
});

export type BashOutputResultValidated = z.infer<typeof BashOutputResultSchema>;

/**
 * TaskOutput tool result schema
 * Matches the TaskOutputResult interface
 */
export const TaskOutputResultSchema = z.object({
  retrieval_status: z.enum(["completed", "timeout", "running"]).optional(),
  task: z
    .object({
      task_id: z.string().optional(),
      task_type: z.enum(["local_bash", "agent"]).optional(),
      status: z.enum(["running", "completed", "failed"]).optional(),
      description: z.string().optional(),
      output: z.string().optional(),
      exitCode: z.number().nullable().optional(),
    })
    .optional(),
});

export type TaskOutputResultValidated = z.infer<typeof TaskOutputResultSchema>;

/**
 * KillShell tool result schema
 * Matches the KillShellResult interface
 */
export const KillShellResultSchema = z.object({
  message: z.string().optional(),
  shell_id: z.string().optional(),
});

export type KillShellResultValidated = z.infer<typeof KillShellResultSchema>;

/**
 * EnterPlanMode tool result schema
 */
export const EnterPlanModeResultSchema = z.object({
  message: z.string().optional(),
});

export type EnterPlanModeResultValidated = z.infer<
  typeof EnterPlanModeResultSchema
>;

/**
 * ExitPlanMode tool result schema
 * Contains the plan content when exiting plan mode
 */
export const ExitPlanModeResultSchema = z.object({
  message: z.string().optional(),
  plan: z.string().optional(),
});

export type ExitPlanModeResultValidated = z.infer<
  typeof ExitPlanModeResultSchema
>;
