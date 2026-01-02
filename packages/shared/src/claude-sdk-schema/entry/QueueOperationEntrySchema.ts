import { z } from "zod";
import { DocumentContentSchema } from "../content/DocumentContentSchema.js";
import { ImageContentSchema } from "../content/ImageContentSchema.js";
import { TextContentSchema } from "../content/TextContentSchema.js";
import { ToolResultContentSchema } from "../content/ToolResultContentSchema.js";

const QueueOperationContentSchema = z.union([
  z.string(),
  TextContentSchema,
  ToolResultContentSchema,
  ImageContentSchema,
  DocumentContentSchema,
]);

export const QueueOperationEntrySchema = z.union([
  z.object({
    type: z.literal("queue-operation"),
    operation: z.literal("enqueue"),
    content: z.union([
      z.string(),
      z.array(z.union([z.string(), QueueOperationContentSchema])),
    ]),
    sessionId: z.string(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("queue-operation"),
    operation: z.literal("dequeue"),
    sessionId: z.string(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("queue-operation"),
    operation: z.literal("remove"),
    sessionId: z.string(),
    timestamp: z.string().datetime(),
  }),
]);

export type QueueOperationEntry = z.infer<typeof QueueOperationEntrySchema>;
