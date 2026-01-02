import { z } from "zod";
import { CommonToolResultSchema } from "./CommonToolSchema.js";
import { TodoToolResultSchema } from "./TodoSchema.js";

export {
  TaskResultSchema,
  BashResultSchema,
  ReadResultSchema,
  EditResultSchema,
  WriteResultSchema,
  GlobResultSchema,
  GrepResultSchema,
  TodoWriteResultSchema,
  WebSearchResultSchema,
  WebFetchResultSchema,
  AskUserQuestionResultSchema,
  BashOutputResultSchema,
  TaskOutputResultSchema,
  KillShellResultSchema,
} from "./ToolResultSchemas.js";

export const ToolUseResultSchema = z.union([
  z.string(),
  TodoToolResultSchema,
  CommonToolResultSchema,
]);
