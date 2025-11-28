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

// Rate limiting for relayer submissions (prevent spam/abuse)
// Tracks submissions by IP to prevent abuse while maintaining anonymity
const submissionRateLimit = new Map<string, { count: number; resetAt: number }>();
const MAX_SUBMISSIONS_PER_HOUR = 10;

const checkRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const record = submissionRateLimit.get(ip);
  
  if (!record || record.resetAt < now) {
    submissionRateLimit.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  
  if (record.count >= MAX_SUBMISSIONS_PER_HOUR) {
    return false;
  }
  
  record.count++;
  return true;
};

// Cleanup old rate limit entries
const cleanupRateLimits = () => {
  const now = Date.now();
  Array.from(submissionRateLimit.entries()).forEach(([key, value]) => {
    if (value.resetAt < now) {
      submissionRateLimit.delete(key);
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

  // NOTE: Direct confession creation is DISABLED to enforce anonymous relayer flow
  // All confessions must go through /api/relayer/submit to ensure privacy
  // This endpoint is kept for internal use only (called from relayer submit)
  app.post("/api/confessions", async (req, res) => {
    // Block all external access - confessions must go through the relayer
    // Only internal requests from the relayer endpoint should create confessions
    return res.status(403).json({ 
      error: "Direct confession creation is disabled. Use the anonymous submission service.",
      hint: "Submit confessions via the UI to protect your privacy."
    });
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

  // NOTE: Direct anchoring is DISABLED to enforce anonymous relayer flow
  // All anchoring must go through /api/relayer/submit to ensure privacy
  app.post("/api/confessions/:id/anchor", async (req, res) => {
    // Block all external access - anchoring must go through the relayer
    return res.status(403).json({ 
      error: "Direct anchoring is disabled. Use the anonymous submission service.",
      hint: "Anchor confessions via the UI to protect your privacy."
    });
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
      cleanupRateLimits();
      
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
  // No user payment required - relayer covers costs from its funded balance
  // Rate limited to prevent abuse while maintaining full anonymity
  const relayerSubmitSchema = z.object({
    confessionText: z.string().min(1).max(1000),
    category: z.enum(confessionCategories),
    paymentTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash"),
  });

  // Track used payment hashes to prevent double-spend
  const usedPaymentHashes = new Set<string>();

  app.post("/api/relayer/submit", async (req, res) => {
    try {
      cleanupRateLimits();
      
      // Rate limit by IP to prevent abuse (doesn't compromise anonymity)
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ 
          error: "Rate limit exceeded. Please try again later.",
          retryAfter: 3600 // 1 hour
        });
      }
      
      const { confessionText, category, paymentTxHash } = relayerSubmitSchema.parse(req.body);
      
      const walletClient = getWalletClient();
      const publicClient = getPublicClient();
      
      if (!walletClient || !CONTRACT_ADDRESS) {
        return res.status(503).json({ 
          error: "Relayer not available"
        });
      }

      // Check if payment hash was already used
      if (usedPaymentHashes.has(paymentTxHash.toLowerCase())) {
        return res.status(400).json({ 
          error: "This payment has already been used for a confession"
        });
      }

      // Get required fee from contract
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

      // VERIFY PAYMENT: Check the user's payment transaction
      console.log("Verifying payment transaction:", paymentTxHash);
      
      let paymentTx;
      let paymentReceipt;
      try {
        paymentTx = await publicClient.getTransaction({ hash: paymentTxHash as `0x${string}` });
        paymentReceipt = await publicClient.getTransactionReceipt({ hash: paymentTxHash as `0x${string}` });
      } catch (e) {
        console.error("Failed to fetch payment transaction:", e);
        return res.status(400).json({ 
          error: "Payment transaction not found. Please wait for confirmation and try again."
        });
      }

      if (!paymentReceipt || paymentReceipt.status !== 'success') {
        return res.status(400).json({ 
          error: "Payment transaction failed or not confirmed"
        });
      }

      // Verify payment was sent TO the relayer wallet
      const relayerAddress = getRelayerAddress();
      if (!relayerAddress) {
        return res.status(503).json({ error: "Relayer not configured" });
      }

      if (paymentTx.to?.toLowerCase() !== relayerAddress.toLowerCase()) {
        return res.status(400).json({ 
          error: "Payment must be sent to the relayer wallet",
          expected: relayerAddress,
          received: paymentTx.to
        });
      }

      // Verify payment amount (allow 10% tolerance for gas price fluctuations)
      const minPayment = (feeWei * BigInt(90)) / BigInt(100);
      if (paymentTx.value < minPayment) {
        return res.status(400).json({ 
          error: "Insufficient payment amount",
          required: feeWei.toString(),
          received: paymentTx.value.toString()
        });
      }

      console.log("Payment verified! From:", paymentTx.from, "Amount:", paymentTx.value.toString());
      
      // Mark payment as used BEFORE submitting (prevent race conditions)
      usedPaymentHashes.add(paymentTxHash.toLowerCase());

      // Check relayer has enough balance to submit
      const balance = await publicClient.getBalance({ address: relayerAddress as `0x${string}` });
      
      if (balance < feeWei + BigInt(100000000000000)) { // Fee + gas buffer
        usedPaymentHashes.delete(paymentTxHash.toLowerCase()); // Rollback
        return res.status(503).json({ 
          error: "Relayer wallet needs more funding. Please try again later.",
          relayerAddress
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
