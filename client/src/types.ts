
export type ConfessionCategory = 'Greed' | 'Regret' | 'FOMO' | 'Rug' | 'Wisdom' | 'Other';

export interface Confession {
  id: string;
  originalText: string;
  displayText: string;
  category: ConfessionCategory;
  timestamp: number;
  txHash?: string; // If anchored on Base
  isAnchored: boolean;
  likes: number;
  dislikes: number;
  userVote?: 'like' | 'dislike' | null; // Track local user state
  sentimentScore: number; // 0-100
}

export interface TrendData {
  mood: number; // 0 (Fear) to 100 (Greed)
  dominantTopic: string;
  hourlyVolume: number;
}

export enum AppView {
  HOME = 'HOME',
  SUBMIT = 'SUBMIT',
  TRENDS = 'TRENDS',
  PROFILE = 'PROFILE',
  DETAIL = 'DETAIL'
}

export interface ProcessingResult {
    rewritten: string;
    category: ConfessionCategory;
    sentiment: number;
    safetyRating: boolean;
}

export interface FarcasterUser {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
}

export interface UserProfile {
    walletAddress: string | null;
    farcaster: FarcasterUser | null;
}