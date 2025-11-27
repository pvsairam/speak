/**
 * MOCK DATABASE SERVICE
 * 
 * In the Hybrid Model:
 * 1. Content is anchored on Base (Blockchain).
 * 2. High-frequency data (Likes, Dislikes, Views) is stored in a traditional DB (Supabase/Postgres).
 * 
 * This service mocks the interaction with that off-chain database.
 */

export const syncVoteToDb = async (confessionId: string, voteType: 'like' | 'dislike' | null): Promise<boolean> => {
    // Simulate network latency (optimistic UI update happens immediately in frontend)
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // In a real app, this would be:
    // await supabase.from('votes').upsert({ user_id, confession_id: confessionId, type: voteType });
    
    console.log(`[Off-Chain DB] Synced vote for confession ${confessionId}: ${voteType || 'removed'}`);
    return true;
};

export const getConfessionStats = async (confessionId: string) => {
    // Mock fetching updated counts
    return {
        likes: Math.floor(Math.random() * 100),
        dislikes: Math.floor(Math.random() * 10)
    };
};