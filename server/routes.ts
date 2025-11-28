import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertConfessionSchema, confessionCategories, type ConfessionCategory } from "@shared/schema";
import { z } from "zod";
import { verifyMessage, createPublicClient, createWalletClient, http, encodeFunctionData, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import crypto from "crypto";

// Relayer configuration
const CONTRACT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS as `0x${string}` | undefined;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}` | undefined;

const CONTRACT_ABI = [
  {
    inputs: [{ type: "string", name: "confessionHash" }],
    name: "storeConfessionHash",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [],
    name: "getFeeInWei",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
] as const;

// Create relayer wallet and clients
const getRelayerAccount = () => {
  if (!RELAYER_PRIVATE_KEY) return null;
  return privateKeyToAccount(RELAYER_PRIVATE_KEY);
};

const getPublicClient = () => {
  return createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });
};

const getWalletClient = () => {
  const account = getRelayerAccount();
  if (!account) return null;
  return createWalletClient({
    account,
    chain: base,
    transport: http('https://mainnet.base.org'),
  });
};

// Get relayer wallet address
const getRelayerAddress = (): string | null => {
  const account = getRelayerAccount();
  return account ? account.address : null;
};

// Pending payments tracking (payment tx hash -> confession data)
const pendingPayments = new Map<string, { 
  confessionText: string; 
  category: string;
  timestamp: number;
  userAddress: string;
}>();

// Cleanup old pending payments (older than 30 minutes)
const cleanupPendingPayments = () => {
  const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
  Array.from(pendingPayments.entries()).forEach(([key, value]) => {
    if (value.timestamp < thirtyMinutesAgo) {
      pendingPayments.delete(key);
    }
  });
};

const adminSessions = new Map<string, { walletAddress: string; expiresAt: number }>();
const adminNonces = new Map<string, { nonce: string; expiresAt: number }>();

function cleanupExpiredSessions() {
  const now = Date.now();
  Array.from(adminSessions.entries()).forEach(([key, session]) => {
    if (session.expiresAt < now) adminSessions.delete(key);
  });
  Array.from(adminNonces.entries()).forEach(([key, nonceData]) => {
    if (nonceData.expiresAt < now) adminNonces.delete(key);
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Farcaster Mini App Manifest - required for Farcaster deployment
  // Account association will be filled in after deployment via Farcaster Developer Dashboard
  app.get("/.well-known/farcaster.json", (req, res) => {
    const appUrl = process.env.APP_URL 
      || req.protocol + '://' + req.get('host');
    
    const farcasterConfig = {
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
        tags: ["base", "farcaster", "miniapp", "crypto", "confessions", "anonymous"],
        primaryCategory: "social",
        buttonTitle: "Confess Anonymously",
        splashImageUrl: `${appUrl}/splash.png`,
        splashBackgroundColor: "#1a1a2e",
        subtitle: "Anonymous crypto confessions on Base",
        description: "Share your crypto secrets anonymously. Confessions are anchored forever on the Base blockchain.",
        webhookUrl: `${appUrl}/api/webhook`,
        tagline: "Speak your crypto truth",
        ogTitle: "Crypto Confessions - Speak.",
        ogDescription: "Share your crypto secrets anonymously. Anchored forever on Base.",
        ogImageUrl: `${appUrl}/og-image.png`,
        heroImageUrl: `${appUrl}/og-image.png`,
      },
    };
    
    res.json(farcasterConfig);
  });

  app.get("/api/confessions", async (req, res) => {
    try {
      cleanupExpiredSessions();
      const confessions = await storage.getConfessions();
      const visitorId = req.headers['x-visitor-id'] as string || 'anonymous';
      
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
        ? confessions 
        : confessions.filter(c => !c.isHidden);
      
      const confessionsWithVotes = await Promise.all(
        filteredConfessions.map(async (confession) => {
          const vote = await storage.getVote(confession.id, visitorId);
          return {
            ...confession,
            userVote: vote?.voteType || null,
          };
        })
      );
      
      res.json(confessionsWithVotes);
    } catch (error) {
      console.error("Error fetching confessions:", error);
      res.status(500).json({ error: "Failed to fetch confessions" });
    }
  });

  app.get("/api/confessions/:id", async (req, res) => {
    try {
      const confession = await storage.getConfession(req.params.id);
      if (!confession) {
        return res.status(404).json({ error: "Confession not found" });
      }
      
      const visitorId = req.headers['x-visitor-id'] as string || 'anonymous';
      const vote = await storage.getVote(confession.id, visitorId);
      
      res.json({
        ...confession,
        userVote: vote?.voteType || null,
      });
    } catch (error) {
      console.error("Error fetching confession:", error);
      res.status(500).json({ error: "Failed to fetch confession" });
    }
  });

  const createConfessionSchema = z.object({
    originalText: z.string().min(1).max(1000),
    displayText: z.string().min(1).max(1000),
    category: z.enum(confessionCategories),
    sentimentScore: z.number().min(0).max(100).default(50),
    isAnchored: z.boolean().default(false),
    txHash: z.string().optional().nullable(),
    authorId: z.string().optional().nullable(),
  });

  app.post("/api/confessions", async (req, res) => {
    try {
      const parsed = createConfessionSchema.parse(req.body);
      const confession = await storage.createConfession(parsed);
      res.status(201).json(confession);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid confession data", details: error.errors });
      }
      console.error("Error creating confession:", error);
      res.status(500).json({ error: "Failed to create confession" });
    }
  });

  const voteSchema = z.object({
    voteType: z.enum(['like', 'dislike']),
    visitorId: z.string().min(1),
  });

  app.post("/api/confessions/:id/vote", async (req, res) => {
    try {
      const { voteType, visitorId } = voteSchema.parse(req.body);
      const confessionId = req.params.id;
      
      const confession = await storage.getConfession(confessionId);
      if (!confession) {
        return res.status(404).json({ error: "Confession not found" });
      }
      
      await storage.createOrUpdateVote(confessionId, visitorId, voteType);
      
      const updated = await storage.getConfession(confessionId);
      const vote = await storage.getVote(confessionId, visitorId);
      
      res.json({
        ...updated,
        userVote: vote?.voteType || null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid vote data", details: error.errors });
      }
      console.error("Error voting:", error);
      res.status(500).json({ error: "Failed to vote" });
    }
  });

  app.delete("/api/confessions/:id/vote", async (req, res) => {
    try {
      const visitorId = req.body?.visitorId || req.headers['x-visitor-id'] as string;
      if (!visitorId) {
        return res.status(400).json({ error: "Visitor ID required" });
      }
      
      const confessionId = req.params.id;
      await storage.removeVote(confessionId, visitorId);
      
      const updated = await storage.getConfession(confessionId);
      res.json({
        ...updated,
        userVote: null,
      });
    } catch (error) {
      console.error("Error removing vote:", error);
      res.status(500).json({ error: "Failed to remove vote" });
    }
  });

  app.post("/api/confessions/:id/anchor", async (req, res) => {
    try {
      const { txHash } = req.body;
      if (!txHash) {
        return res.status(400).json({ error: "Transaction hash required" });
      }
      
      const updated = await storage.updateConfessionAnchored(req.params.id, txHash);
      if (!updated) {
        return res.status(404).json({ error: "Confession not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error anchoring confession:", error);
      res.status(500).json({ error: "Failed to anchor confession" });
    }
  });

  app.post("/api/admin/password", async (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD;
      
      if (!adminPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }
      
      if (password === adminPassword) {
        res.json({ success: true });
      } else {
        res.status(401).json({ error: "Invalid password" });
      }
    } catch (error) {
      console.error("Error verifying password:", error);
      res.status(500).json({ error: "Failed to verify password" });
    }
  });

  app.post("/api/admin/nonce", async (req, res) => {
    try {
      cleanupExpiredSessions();
      const { walletAddress } = req.body;
      
      if (!walletAddress) {
        return res.status(400).json({ error: "Wallet address required" });
      }
      
      const nonce = crypto.randomBytes(32).toString('hex');
      const message = `Crypto Confessions Admin Authentication\n\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
      
      adminNonces.set(walletAddress.toLowerCase(), {
        nonce,
        expiresAt: Date.now() + 5 * 60 * 1000
      });
      
      res.json({ message, nonce });
    } catch (error) {
      console.error("Error generating nonce:", error);
      res.status(500).json({ error: "Failed to generate nonce" });
    }
  });

  app.post("/api/admin/verify", async (req, res) => {
    try {
      cleanupExpiredSessions();
      const { walletAddress, signature, message } = req.body;
      
      if (!walletAddress || !signature || !message) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const nonceData = adminNonces.get(walletAddress.toLowerCase());
      if (!nonceData || nonceData.expiresAt < Date.now()) {
        return res.status(401).json({ error: "Nonce expired or invalid" });
      }
      
      if (!message.includes(nonceData.nonce)) {
        return res.status(401).json({ error: "Invalid nonce in message" });
      }
      
      const isValid = await verifyMessage({
        address: walletAddress as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
      
      if (!isValid) {
        return res.status(401).json({ error: "Invalid signature" });
      }
      
      const ownerAddress = process.env.ADMIN_WALLET_ADDRESS || process.env.CONTRACT_OWNER_ADDRESS;
      if (ownerAddress && walletAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
        return res.status(403).json({ error: "Not authorized as admin" });
      }
      
      const sessionToken = crypto.randomBytes(32).toString('hex');
      adminSessions.set(sessionToken, {
        walletAddress: walletAddress.toLowerCase(),
        expiresAt: Date.now() + 60 * 60 * 1000
      });
      
      adminNonces.delete(walletAddress.toLowerCase());
      
      res.json({ sessionToken, expiresIn: 3600 });
    } catch (error) {
      console.error("Error verifying signature:", error);
      res.status(500).json({ error: "Failed to verify signature" });
    }
  });

  app.patch("/api/confessions/:id/visibility", async (req, res) => {
    try {
      cleanupExpiredSessions();
      const sessionToken = req.headers['x-admin-session'] as string;
      
      if (!sessionToken) {
        return res.status(401).json({ error: "Admin session required" });
      }
      
      const session = adminSessions.get(sessionToken);
      if (!session || session.expiresAt < Date.now()) {
        adminSessions.delete(sessionToken);
        return res.status(401).json({ error: "Session expired" });
      }
      
      const { isHidden } = req.body;
      if (typeof isHidden !== 'boolean') {
        return res.status(400).json({ error: "isHidden must be a boolean" });
      }
      
      const updated = await storage.updateConfessionVisibility(req.params.id, isHidden);
      if (!updated) {
        return res.status(404).json({ error: "Confession not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating visibility:", error);
      res.status(500).json({ error: "Failed to update visibility" });
    }
  });

  app.get("/api/trends", async (req, res) => {
    try {
      const confessions = await storage.getConfessions();
      
      const categoryCounts: Record<string, number> = {};
      let totalLikes = 0;
      let anchoredCount = 0;
      
      confessions.forEach(c => {
        categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
        totalLikes += c.likes;
        if (c.isAnchored) anchoredCount++;
      });
      
      const categories = Object.entries(categoryCounts)
        .map(([name, count]) => ({
          name,
          count,
          percent: confessions.length > 0 ? Math.round((count / confessions.length) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count);
      
      const topCategory = categories[0]?.name || 'None';
      
      const topConfessions = [...confessions]
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 3)
        .map(c => ({
          id: c.id,
          text: c.displayText.slice(0, 80) + (c.displayText.length > 80 ? '...' : ''),
          likes: c.likes,
          category: c.category
        }));
      
      res.json({
        total: confessions.length,
        anchored: anchoredCount,
        anchoredPercent: confessions.length > 0 ? Math.round((anchoredCount / confessions.length) * 100) : 0,
        topCategory,
        categories,
        topConfessions,
        totalLikes
      });
    } catch (error) {
      console.error("Error fetching trends:", error);
      res.status(500).json({ error: "Failed to fetch trends" });
    }
  });

  // ==================== RELAYER ENDPOINTS ====================
  // These enable anonymous confessions by having the server submit on-chain

  // Get relayer info (wallet address and status)
  app.get("/api/relayer/info", async (req, res) => {
    try {
      cleanupPendingPayments();
      
      const relayerAddress = getRelayerAddress();
      const isEnabled = !!relayerAddress && !!CONTRACT_ADDRESS;
      
      if (!isEnabled) {
        return res.json({
          enabled: false,
          message: "Relayer not configured. Direct wallet submissions will be used."
        });
      }

      // Get required fee from contract
      const publicClient = getPublicClient();
      let feeWei = BigInt(330000000000000); // ~$1 default
      
      try {
        const result = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getFeeInWei',
        });
        feeWei = result;
      } catch (e) {
        console.log("Using default fee");
      }

      // Get relayer wallet balance
      let balance = BigInt(0);
      try {
        balance = await publicClient.getBalance({ address: relayerAddress as `0x${string}` });
      } catch (e) {
        console.log("Could not get balance");
      }

      res.json({
        enabled: true,
        relayerAddress,
        feeWei: feeWei.toString(),
        balanceWei: balance.toString(),
        hasEnoughBalance: balance > feeWei * BigInt(2), // At least 2x fee for safety
      });
    } catch (error) {
      console.error("Error getting relayer info:", error);
      res.status(500).json({ error: "Failed to get relayer info" });
    }
  });

  // Submit confession via relayer (anonymous)
  const relayerSubmitSchema = z.object({
    confessionText: z.string().min(1).max(1000),
    category: z.enum(confessionCategories),
    paymentTxHash: z.string().optional(), // Optional - if user paid to relayer wallet
  });

  app.post("/api/relayer/submit", async (req, res) => {
    try {
      cleanupPendingPayments();
      
      const { confessionText, category, paymentTxHash } = relayerSubmitSchema.parse(req.body);
      
      const walletClient = getWalletClient();
      const publicClient = getPublicClient();
      
      if (!walletClient || !CONTRACT_ADDRESS) {
        return res.status(503).json({ 
          error: "Relayer not available",
          fallback: true // Frontend should fall back to direct submission
        });
      }

      // Get required fee
      let feeWei = BigInt(330000000000000);
      try {
        const result = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getFeeInWei',
        });
        feeWei = result;
      } catch (e) {
        console.log("Using default fee for relayer submission");
      }

      // Check relayer has enough balance
      const relayerAddress = getRelayerAddress();
      const balance = await publicClient.getBalance({ address: relayerAddress as `0x${string}` });
      
      if (balance < feeWei + BigInt(100000000000000)) { // Fee + gas buffer
        return res.status(503).json({ 
          error: "Relayer wallet needs funding",
          relayerAddress,
          needed: (feeWei + BigInt(100000000000000)).toString(),
          balance: balance.toString(),
          fallback: true
        });
      }

      // Create confession hash
      const confessionHash = keccak256(toHex(confessionText));
      console.log("Relayer submitting confession hash:", confessionHash);

      // Encode function data
      const data = encodeFunctionData({
        abi: CONTRACT_ABI,
        functionName: 'storeConfessionHash',
        args: [confessionHash]
      });

      // Submit transaction from relayer wallet
      const txHash = await walletClient.sendTransaction({
        to: CONTRACT_ADDRESS,
        data,
        value: feeWei,
      });

      console.log("Relayer transaction submitted:", txHash);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ 
        hash: txHash,
        timeout: 60000 // 60 second timeout
      });

      if (receipt.status === 'reverted') {
        throw new Error("Transaction reverted");
      }

      // Create confession in database (without user's tx hash - use relayer's)
      const confession = await storage.createConfession({
        originalText: confessionText,
        displayText: confessionText,
        category: category as ConfessionCategory,
        sentimentScore: 50,
        isAnchored: true,
        txHash: txHash, // Relayer's tx hash (anonymous!)
      });

      console.log("Anonymous confession created:", confession.id);

      res.json({
        success: true,
        confession,
        txHash, // This is the RELAYER's tx hash - anonymous!
        message: "Confession anchored anonymously"
      });

    } catch (error: any) {
      console.error("Relayer submission failed:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      
      // Check for specific error types
      if (error.message?.includes('Already exists')) {
        return res.status(409).json({ error: "This confession has already been anchored" });
      }
      
      res.status(500).json({ 
        error: error.message || "Failed to submit confession",
        fallback: true // Frontend can retry with direct submission
      });
    }
  });

  return httpServer;
}
