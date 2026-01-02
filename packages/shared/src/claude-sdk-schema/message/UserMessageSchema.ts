import { z } from "zod";
import { DocumentContentSchema } from "../content/DocumentContentSchema.js";
import { ImageContentSchema } from "../content/ImageContentSchema.js";
import { TextContentSchema } from "../content/TextContentSchema.js";
import { ToolResultContentSchema } from "../content/ToolResultContentSchema.js";

const UserMessageContentSchema = z.union([
  z.string(),
  TextContentSchema,
  ToolResultContentSchema,
  ImageContentSchema,
  DocumentContentSchema,
]);

export type UserMessageContent = z.infer<typeof UserMessageContentSchema>;

export const UserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.union([
    z.string(),
    z.array(z.union([z.string(), UserMessageContentSchema])),
  ]),
});
