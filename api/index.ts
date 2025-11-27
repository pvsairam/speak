import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, desc, and, sql } from 'drizzle-orm';
import { pgTable, serial, varchar, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { verifyMessage } from 'viem';
import crypto from 'crypto';

const confessionCategories = ["Greed", "Regret", "FOMO", "Rug", "Wisdom", "Other"] as const;
type ConfessionCategory = typeof confessionCategories[number];

const confessions = pgTable("confessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalText: text("original_text").notNull(),
  displayText: text("display_text").notNull(),
  category: text("category").notNull().default("Other"),
  sentimentScore: integer("sentiment_score").notNull().default(50),
  likes: integer("likes").notNull().default(0),
  dislikes: integer("dislikes").notNull().default(0),
  isAnchored: boolean("is_anchored").notNull().default(false),
  txHash: text("tx_hash"),
  isHidden: boolean("is_hidden").notNull().default(false),
  timestamp: integer("timestamp").notNull(),
});

const votes = pgTable("votes", {
  id: serial("id").primaryKey(),
  confessionId: varchar("confession_id").notNull(),
  visitorId: varchar("visitor_id").notNull(),
  voteType: varchar("vote_type", { length: 10 }).notNull(),
});

const adminSessions = new Map<string, { walletAddress: string; expiresAt: number }>();
const adminNonces = new Map<string, { nonce: string; expiresAt: number }>();

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const client = neon(databaseUrl);
  return drizzle(client);
}

function cleanupExpiredSessions() {
  const now = Date.now();
  Array.from(adminSessions.entries()).forEach(([key, session]) => {
    if (session.expiresAt < now) adminSessions.delete(key);
  });
  Array.from(adminNonces.entries()).forEach(([key, nonceData]) => {
    if (nonceData.expiresAt < now) adminNonces.delete(key);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method, url } = req;
  const path = url?.split('?')[0] || '';
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-visitor-id, x-admin-session');
  
  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const db = getDb();

    if (path === '/.well-known/farcaster.json' && method === 'GET') {
      const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
      return res.json({
        accountAssociation: {
          header: process.env.FARCASTER_HEADER || "",
          payload: process.env.FARCASTER_PAYLOAD || "",
          signature: process.env.FARCASTER_SIGNATURE || ""
        },
        frame: {
          version: "1",
          name: "Crypto Confessions",
          iconUrl: `${appUrl}/icon.png`,
          homeUrl: `${appUrl}`,
          imageUrl: `${appUrl}/og-image.png`,
          screenshotUrls: [],
          tags: ["base", "crypto", "confessions", "social", "anonymous"],
          primaryCategory: "social",
          buttonTitle: "Confess Anonymously",
          splashImageUrl: `${appUrl}/splash.png`,
          splashBackgroundColor: "#1a1a2e",
          subtitle: "Crypto confessions on Base",
          description: "Share your crypto secrets anonymously. Confessions are anchored forever on the Base blockchain.",
        },
      });
    }

    if (path === '/api/confessions' && method === 'GET') {
      cleanupExpiredSessions();
      const allConfessions = await db.select().from(confessions).orderBy(desc(confessions.timestamp));
      const visitorId = (req.headers['x-visitor-id'] as string) || 'anonymous';
      
      let includeHidden = false;
      if (req.query.includeHidden === 'true') {
        const sessionToken = req.headers['x-admin-session'] as string;
        if (sessionToken) {
          const session = adminSessions.get(sessionToken);
          if (session && session.expiresAt > Date.now()) {
            includeHidden = true;
          }
        }
      }
      
      const filteredConfessions = includeHidden 
        ? allConfessions 
        : allConfessions.filter(c => !c.isHidden);
      
      const confessionsWithVotes = await Promise.all(
        filteredConfessions.map(async (confession) => {
          const [vote] = await db.select().from(votes).where(
            and(eq(votes.confessionId, confession.id), eq(votes.visitorId, visitorId))
          );
          return {
            ...confession,
            userVote: vote?.voteType || null,
          };
        })
      );
      
      return res.json(confessionsWithVotes);
    }

    if (path.match(/^\/api\/confessions\/[^/]+$/) && method === 'GET') {
      const id = path.split('/').pop()!;
      const [confession] = await db.select().from(confessions).where(eq(confessions.id, id));
      
      if (!confession) {
        return res.status(404).json({ error: "Confession not found" });
      }
      
      const visitorId = (req.headers['x-visitor-id'] as string) || 'anonymous';
      const [vote] = await db.select().from(votes).where(
        and(eq(votes.confessionId, confession.id), eq(votes.visitorId, visitorId))
      );
      
      return res.json({
        ...confession,
        userVote: vote?.voteType || null,
      });
    }

    if (path === '/api/confessions' && method === 'POST') {
      const { originalText, displayText, category = "Other", isAnchored = false, txHash = null } = req.body;
      
      if (!originalText || !displayText) {
        return res.status(400).json({ error: "originalText and displayText are required" });
      }
      
      const [confession] = await db.insert(confessions).values({
        originalText,
        displayText,
        category: category as ConfessionCategory,
        sentimentScore: 50,
        isAnchored: Boolean(isAnchored),
        txHash: txHash || null,
        timestamp: Math.floor(Date.now() / 1000),
      }).returning();
      
      return res.status(201).json(confession);
    }

    if (path.match(/^\/api\/confessions\/[^/]+\/anchor$/) && method === 'POST') {
      const id = path.split('/')[3];
      const { txHash } = req.body;
      
      if (!txHash) {
        return res.status(400).json({ error: "Transaction hash required" });
      }
      
      const [updated] = await db.update(confessions)
        .set({ isAnchored: true, txHash })
        .where(eq(confessions.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Confession not found" });
      }
      
      return res.json(updated);
    }

    if (path.match(/^\/api\/confessions\/[^/]+\/vote$/) && method === 'POST') {
      const id = path.split('/')[3];
      const { voteType, visitorId } = req.body;
      
      if (!voteType || !['up', 'down', 'like', 'dislike'].includes(voteType)) {
        return res.status(400).json({ error: "Invalid vote type" });
      }
      if (!visitorId) {
        return res.status(400).json({ error: "Visitor ID required" });
      }
      
      const mappedVoteType = (voteType === 'up' || voteType === 'like') ? 'like' : 'dislike';
      
      const [existingVote] = await db.select().from(votes).where(
        and(eq(votes.confessionId, id), eq(votes.visitorId, visitorId))
      );
      
      if (existingVote) {
        if (existingVote.voteType !== mappedVoteType) {
          const likeDelta = mappedVoteType === 'like' ? 1 : -1;
          const dislikeDelta = mappedVoteType === 'dislike' ? 1 : -1;
          
          await db.update(votes).set({ voteType: mappedVoteType }).where(eq(votes.id, existingVote.id));
          await db.update(confessions).set({
            likes: sql`${confessions.likes} + ${likeDelta}`,
            dislikes: sql`${confessions.dislikes} + ${dislikeDelta}`,
          }).where(eq(confessions.id, id));
        }
      } else {
        await db.insert(votes).values({ confessionId: id, visitorId, voteType: mappedVoteType });
        if (mappedVoteType === 'like') {
          await db.update(confessions).set({ likes: sql`${confessions.likes} + 1` }).where(eq(confessions.id, id));
        } else {
          await db.update(confessions).set({ dislikes: sql`${confessions.dislikes} + 1` }).where(eq(confessions.id, id));
        }
      }
      
      const [confession] = await db.select().from(confessions).where(eq(confessions.id, id));
      return res.json(confession);
    }

    if (path.match(/^\/api\/confessions\/[^/]+\/vote$/) && method === 'DELETE') {
      const id = path.split('/')[3];
      const visitorId = req.headers['x-visitor-id'] as string;
      
      if (!visitorId) {
        return res.status(400).json({ error: "Visitor ID required" });
      }
      
      const [existingVote] = await db.select().from(votes).where(
        and(eq(votes.confessionId, id), eq(votes.visitorId, visitorId))
      );
      
      if (existingVote) {
        await db.delete(votes).where(eq(votes.id, existingVote.id));
        if (existingVote.voteType === 'like') {
          await db.update(confessions).set({ likes: sql`${confessions.likes} - 1` }).where(eq(confessions.id, id));
        } else {
          await db.update(confessions).set({ dislikes: sql`${confessions.dislikes} - 1` }).where(eq(confessions.id, id));
        }
      }
      
      return res.json({ success: true });
    }

    if (path === '/api/trends' && method === 'GET') {
      const allConfessions = await db.select().from(confessions);
      const visibleConfessions = allConfessions.filter(c => !c.isHidden);
      
      const totalConfessions = visibleConfessions.length;
      const anchoredConfessions = visibleConfessions.filter(c => c.isAnchored).length;
      const anchoredPercentage = totalConfessions > 0 ? Math.round((anchoredConfessions / totalConfessions) * 100) : 0;
      
      const categoryBreakdown: Record<string, { count: number; percentage: number }> = {};
      confessionCategories.forEach(cat => {
        const count = visibleConfessions.filter(c => c.category === cat).length;
        categoryBreakdown[cat] = {
          count,
          percentage: totalConfessions > 0 ? Math.round((count / totalConfessions) * 100) : 0
        };
      });
      
      const totalLikes = visibleConfessions.reduce((sum, c) => sum + (c.likes || 0), 0);
      
      const topConfessions = [...visibleConfessions]
        .sort((a, b) => (b.likes || 0) - (a.likes || 0))
        .slice(0, 3)
        .map(c => ({
          id: c.id,
          text: c.displayText?.substring(0, 100) + ((c.displayText?.length || 0) > 100 ? '...' : ''),
          likes: c.likes || 0,
          category: c.category
        }));
      
      return res.json({
        totalConfessions,
        anchoredConfessions,
        anchoredPercentage,
        categoryBreakdown,
        totalLikes,
        topConfessions
      });
    }

    if (path === '/api/admin/password' && method === 'POST') {
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD;
      
      if (!adminPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }
      
      if (password === adminPassword) {
        return res.json({ success: true });
      } else {
        return res.status(401).json({ error: "Invalid password" });
      }
    }

    if (path === '/api/admin/nonce' && method === 'POST') {
      const { walletAddress } = req.body;
      if (!walletAddress) {
        return res.status(400).json({ error: "Wallet address required" });
      }
      
      cleanupExpiredSessions();
      const nonce = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 5 * 60 * 1000;
      
      adminNonces.set(walletAddress.toLowerCase(), { nonce, expiresAt });
      
      const message = `Sign this message to authenticate as admin.\n\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString()}`;
      
      return res.json({ message, nonce });
    }

    if (path === '/api/admin/verify' && method === 'POST') {
      const { walletAddress, signature } = req.body;
      
      if (!walletAddress || !signature) {
        return res.status(400).json({ error: "Wallet address and signature required" });
      }
      
      const nonceData = adminNonces.get(walletAddress.toLowerCase());
      if (!nonceData || nonceData.expiresAt < Date.now()) {
        return res.status(401).json({ error: "Nonce expired or not found" });
      }
      
      const message = `Sign this message to authenticate as admin.\n\nNonce: ${nonceData.nonce}\nTimestamp: ${new Date().toISOString().split('T')[0]}`;
      
      try {
        const isValid = await verifyMessage({
          address: walletAddress as `0x${string}`,
          message,
          signature: signature as `0x${string}`,
        });
        
        if (!isValid) {
          return res.status(401).json({ error: "Invalid signature" });
        }
        
        adminNonces.delete(walletAddress.toLowerCase());
        
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + 60 * 60 * 1000;
        
        adminSessions.set(sessionToken, { walletAddress, expiresAt });
        
        return res.json({ sessionToken, expiresAt });
      } catch (error) {
        console.error("Signature verification error:", error);
        return res.status(401).json({ error: "Signature verification failed" });
      }
    }

    if (path.match(/^\/api\/confessions\/[^/]+\/visibility$/) && method === 'PATCH') {
      const sessionToken = req.headers['x-admin-session'] as string;
      
      if (!sessionToken) {
        return res.status(401).json({ error: "Admin session required" });
      }
      
      cleanupExpiredSessions();
      const session = adminSessions.get(sessionToken);
      
      if (!session || session.expiresAt < Date.now()) {
        return res.status(401).json({ error: "Session expired" });
      }
      
      const id = path.split('/')[3];
      const { isHidden } = req.body;
      
      const [updated] = await db.update(confessions)
        .set({ isHidden })
        .where(eq(confessions.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Confession not found" });
      }
      
      return res.json(updated);
    }

    return res.status(404).json({ error: "Not found" });
    
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
