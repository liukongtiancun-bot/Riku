import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const sharedAudioTable = pgTable("shared_audio", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull().unique(),
  fileSize: integer("file_size").notNull(),
  amount: integer("amount").notNull(),
  semitones: integer("semitones").notNull(),
  use8D: boolean("use_8d").notNull(),
  cleanAudio: boolean("clean_audio").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSharedAudioSchema = createInsertSchema(sharedAudioTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSharedAudio = z.infer<typeof insertSharedAudioSchema>;
export type SharedAudio = typeof sharedAudioTable.$inferSelect;