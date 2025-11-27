import { type User, type InsertUser, type Confession, type InsertConfession, type Vote, type InsertVote, confessions, votes, users } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getConfessions(): Promise<Confession[]>;
  getConfession(id: string): Promise<Confession | undefined>;
  createConfession(confession: InsertConfession): Promise<Confession>;
  updateConfessionAnchored(id: string, txHash: string): Promise<Confession | undefined>;
  updateConfessionVisibility(id: string, isHidden: boolean): Promise<Confession | undefined>;
  
  getVote(confessionId: string, visitorId: string): Promise<Vote | undefined>;
  createOrUpdateVote(confessionId: string, visitorId: string, voteType: 'like' | 'dislike'): Promise<void>;
  removeVote(confessionId: string, visitorId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getConfessions(): Promise<Confession[]> {
    return await db.select().from(confessions).orderBy(desc(confessions.timestamp));
  }

  async getConfession(id: string): Promise<Confession | undefined> {
    const [confession] = await db.select().from(confessions).where(eq(confessions.id, id));
    return confession;
  }

  async createConfession(insertConfession: InsertConfession): Promise<Confession> {
    const [confession] = await db.insert(confessions).values(insertConfession).returning();
    return confession;
  }

  async updateConfessionAnchored(id: string, txHash: string): Promise<Confession | undefined> {
    const [updated] = await db.update(confessions)
      .set({ isAnchored: true, txHash })
      .where(eq(confessions.id, id))
      .returning();
    return updated;
  }

  async updateConfessionVisibility(id: string, isHidden: boolean): Promise<Confession | undefined> {
    const [updated] = await db.update(confessions)
      .set({ isHidden })
      .where(eq(confessions.id, id))
      .returning();
    return updated;
  }

  async getVote(confessionId: string, visitorId: string): Promise<Vote | undefined> {
    const [vote] = await db.select().from(votes).where(
      and(eq(votes.confessionId, confessionId), eq(votes.visitorId, visitorId))
    );
    return vote;
  }

  async createOrUpdateVote(confessionId: string, visitorId: string, voteType: 'like' | 'dislike'): Promise<void> {
    const existingVote = await this.getVote(confessionId, visitorId);
    
    if (existingVote) {
      if (existingVote.voteType === voteType) {
        return;
      }
      
      const likeDelta = voteType === 'like' ? 1 : -1;
      const dislikeDelta = voteType === 'dislike' ? 1 : -1;
      
      await db.update(votes)
        .set({ voteType })
        .where(eq(votes.id, existingVote.id));
      
      await db.update(confessions)
        .set({
          likes: sql`${confessions.likes} + ${likeDelta}`,
          dislikes: sql`${confessions.dislikes} + ${dislikeDelta}`,
        })
        .where(eq(confessions.id, confessionId));
    } else {
      await db.insert(votes).values({ confessionId, visitorId, voteType });
      
      if (voteType === 'like') {
        await db.update(confessions)
          .set({ likes: sql`${confessions.likes} + 1` })
          .where(eq(confessions.id, confessionId));
      } else {
        await db.update(confessions)
          .set({ dislikes: sql`${confessions.dislikes} + 1` })
          .where(eq(confessions.id, confessionId));
      }
    }
  }

  async removeVote(confessionId: string, visitorId: string): Promise<void> {
    const existingVote = await this.getVote(confessionId, visitorId);
    if (!existingVote) return;
    
    await db.delete(votes).where(eq(votes.id, existingVote.id));
    
    if (existingVote.voteType === 'like') {
      await db.update(confessions)
        .set({ likes: sql`${confessions.likes} - 1` })
        .where(eq(confessions.id, confessionId));
    } else {
      await db.update(confessions)
        .set({ dislikes: sql`${confessions.dislikes} - 1` })
        .where(eq(confessions.id, confessionId));
    }
  }
}

export const storage = new DatabaseStorage();
