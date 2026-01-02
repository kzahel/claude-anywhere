import { z } from "zod";
import { UserMessageSchema } from "../message/UserMessageSchema.js";
import { BaseEntrySchema } from "./BaseEntrySchema.js";

export const UserEntrySchema = BaseEntrySchema.extend({
  // discriminator
  type: z.literal("user"),

  // required
  message: UserMessageSchema,
});

export type UserEntry = z.infer<typeof UserEntrySchema>;
