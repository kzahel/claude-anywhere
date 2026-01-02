import { z } from "zod";
import { CommonToolResultSchema } from "./CommonToolSchema.js";
import { TodoToolResultSchema } from "./TodoSchema.js";

export const ToolUseResultSchema = z.union([
  z.string(),
  TodoToolResultSchema,
  CommonToolResultSchema,
]);
