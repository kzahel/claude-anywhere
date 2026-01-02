import { z } from "zod";
import { BaseEntrySchema } from "./BaseEntrySchema.js";

// Regular system entry (tool-related)
const RegularSystemEntrySchema = BaseEntrySchema.extend({
  type: z.literal("system"),
  content: z.string(),
  toolUseID: z.string(),
  level: z.enum(["info"]),
});

// Compact boundary system entry (conversation compaction)
const CompactBoundarySystemEntrySchema = BaseEntrySchema.extend({
  type: z.literal("system"),
  subtype: z.literal("compact_boundary"),
  content: z.string(),
  level: z.enum(["info"]),
  slug: z.string().optional(),
  logicalParentUuid: z.string().uuid().optional(),
  compactMetadata: z
    .object({
      trigger: z.string(),
      preTokens: z.number(),
    })
    .optional(),
});

export const SystemEntrySchema = z.union([
  RegularSystemEntrySchema,
  CompactBoundarySystemEntrySchema,
]);

export type SystemEntry = z.infer<typeof SystemEntrySchema>;
