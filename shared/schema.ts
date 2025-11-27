import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  walletAddress: text("wallet_address"),
  farcasterFid: integer("farcaster_fid"),
  farcasterUsername: text("farcaster_username"),
  farcasterDisplayName: text("farcaster_display_name"),
  farcasterPfpUrl: text("farcaster_pfp_url"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const confessionCategories = ['Greed', 'Regret', 'FOMO', 'Rug', 'Wisdom', 'Other'] as const;
export type ConfessionCategory = typeof confessionCategories[number];

export const confessions = pgTable("confessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalText: text("original_text").notNull(),
  displayText: text("display_text").notNull(),
  category: text("category").notNull().$type<ConfessionCategory>(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull().default(sql`extract(epoch from now()) * 1000`),
  txHash: text("tx_hash"),
  isAnchored: boolean("is_anchored").notNull().default(false),
  isHidden: boolean("is_hidden").notNull().default(false),
  likes: integer("likes").notNull().default(0),
  dislikes: integer("dislikes").notNull().default(0),
  sentimentScore: integer("sentiment_score").notNull().default(50),
  authorId: varchar("author_id").references(() => users.id),
});

export const insertConfessionSchema = createInsertSchema(confessions).omit({
  id: true,
  timestamp: true,
  likes: true,
  dislikes: true,
});

export type InsertConfession = z.infer<typeof insertConfessionSchema>;
export type Confession = typeof confessions.$inferSelect;

export const votes = pgTable("votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  confessionId: varchar("confession_id").notNull().references(() => confessions.id),
  visitorId: text("visitor_id").notNull(),
  voteType: text("vote_type").notNull().$type<'like' | 'dislike'>(),
});

export const insertVoteSchema = createInsertSchema(votes).omit({
  id: true,
});

export type InsertVote = z.infer<typeof insertVoteSchema>;
export type Vote = typeof votes.$inferSelect;
