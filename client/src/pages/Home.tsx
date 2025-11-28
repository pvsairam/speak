
import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Home, 
  PenTool, 
  TrendingUp, 
  User, 
  Send, 
  Check, 
  Lock, 
  Zap,
  Search,
  Filter,
  Heart,
  ThumbsDown,
  ArrowLeft,
  Share2,
  ExternalLink,
  Copy,
  Wallet,
  LogOut
} from 'lucide-react';

import { SketchButton, SketchCard, SketchInput, Badge, SketchVoteButton } from '../components/SketchComponents';
import { isAnchoringEnabled, getConfessionFeeDisplay, getContractFee, getActiveChain } from '../services/web3Service';
import { AppView, Confession, ConfessionCategory, UserProfile } from '../types';

import { useAccount, useConnect, useDisconnect, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import sdk from '@farcaster/frame-sdk';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';

const FarcasterIcon = ({ size = 20, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M18.75 3H5.25C4.00736 3 3 4.00736 3 5.25V18.75C3 19.9926 4.00736 21 5.25 21H18.75C19.9926 21 21 19.9926 21 18.75V5.25C21 4.00736 19.9926 3 18.75 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8.25 10.5V15.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M15.75 10.5V15.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8.25 10.5H15.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const XIcon = ({ size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M16.99 3H20.298L13.071 11.26L21.573 22.5H14.916L9.702 15.683L3.736 22.5H0.426L8.156 13.665L0 3H6.826L11.539 9.231L16.99 3ZM15.829 20.52H17.662L5.83 4.88H3.863L15.829 20.52Z" fill="currentColor"/>
  </svg>
);

const getVisitorId = (): string => {
  let visitorId = localStorage.getItem('visitor_id');
  if (!visitorId) {
    visitorId = 'v_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('visitor_id', visitorId);
  }
  return visitorId;
};

const fetchConfessions = async (): Promise<Confession[]> => {
  try {
    const response = await fetch('/api/confessions', {
      headers: { 'x-visitor-id': getVisitorId() }
    });
    if (!response.ok) throw new Error('Failed to fetch');
    const data = await response.json();
    return data.map((c: any) => ({
      ...c,
      displayText: c.processedText || c.displayText || c.originalText,
      timestamp: typeof c.timestamp === 'number' && c.timestamp < 10000000000 
        ? c.timestamp * 1000 
        : new Date(c.timestamp).getTime(),
      userVote: c.userVote === 'like' ? 'like' : c.userVote === 'dislike' ? 'dislike' : null,
    }));
  } catch (error) {
    console.error('Error fetching confessions:', error);
    return [];
  }
};

// NOTE: Direct confession creation is disabled - use /api/relayer/submit for anonymous submissions

const voteOnConfession = async (id: string, voteType: 'like' | 'dislike'): Promise<Confession | null> => {
  try {
    const response = await fetch(`/api/confessions/${id}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voteType, visitorId: getVisitorId() }),
    });
    if (!response.ok) throw new Error('Failed to vote');
    const data = await response.json();
    return {
      ...data,
      displayText: data.processedText || data.displayText || data.originalText,
      timestamp: typeof data.timestamp === 'number' && data.timestamp < 10000000000 
        ? data.timestamp * 1000 
        : new Date(data.timestamp).getTime(),
      userVote: data.userVote || voteType,
    };
  } catch (error) {
    console.error('Error voting:', error);
    return null;
  }
};

// NOTE: Direct anchoring is disabled - use /api/relayer/submit for anonymous anchoring

const NavBtn = ({ icon: Icon, active, onClick, label, disabled }: any) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className={`flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-colors ${active ? 'text-black' : 'text-gray-400 hover:text-gray-600'} ${disabled ? 'opacity-30' : ''}`}
  >
    <Icon size={24} strokeWidth={active ? 3 : 2} />
    {active && <span className="text-[10px] font-bold mt-1">{label}</span>}
  </button>
);

const HomeView = ({ confessions, openConfessionDetail, handleVote, handleAnchor, userProfile }: any) => (
  <div className="space-y-6">
     <div className="pt-4 pb-2 border-b-2 border-transparent transition-all animate-fade-in">
        <h1 className="text-4xl font-display font-black mb-1">Speak.</h1>
        <p className="text-gray-500 font-mono text-sm mb-4">The blockchain keeps your secrets.</p>
        
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search the void..." 
            className="w-full bg-white border-2 border-black rounded-full py-3 pl-12 pr-4 shadow-sketch-sm focus:outline-none focus:shadow-sketch transition-all"
          />
          <Search className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
        </div>
     </div>

    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar animate-fade-in" style={{animationDelay: '100ms'}}>
      {['All', 'Regret', 'FOMO', 'Greed', 'Wisdom', 'Rug'].map(tag => (
        <button key={tag} className="flex-shrink-0 px-4 py-1 border-2 border-black rounded-md font-bold text-sm bg-white active:bg-black active:text-white transition-colors">
          #{tag}
        </button>
      ))}
    </div>

     <div className="space-y-6">
       {confessions.map((confession: Confession, index: number) => (
         <SketchCard 
            key={confession.id} 
            delay={index}
            onClick={() => openConfessionDetail(confession.id)}
            className=""
          >
           <div className="flex justify-between items-start mb-3">
             <Badge color="bg-teal-dim">{confession.category}</Badge>
             <span className="text-xs font-mono text-gray-500">
               {new Date(confession.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
             </span>
           </div>
           
           <p className="font-sans text-lg leading-relaxed mb-4 text-ink">
             {confession.displayText}
           </p>

           <div className="flex justify-between items-end pt-3 border-t-2 border-gray-100/50">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <SketchVoteButton 
                      type="like" 
                      isActive={confession.userVote === 'like'}
                      onClick={(e) => handleVote(e, confession.id, 'like')}
                      count={confession.likes}
                  />
                  <SketchVoteButton 
                      type="dislike" 
                      isActive={confession.userVote === 'dislike'}
                      onClick={(e) => handleVote(e, confession.id, 'dislike')}
                      count={confession.dislikes}
                  />
                </div>
                
                <div className={`h-2 w-2 rounded-full ml-1 ${confession.sentimentScore > 50 ? 'bg-green-400' : 'bg-red-400'}`} title={`Sentiment: ${confession.sentimentScore}`} />
              </div>

              <button 
                onClick={(e) => handleAnchor(e, confession.id)}
                className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border-2 border-black transition-all active:scale-95 ${confession.isAnchored ? 'bg-cyan text-white cursor-default' : 'bg-transparent hover:bg-gray-100'}`}
                disabled={confession.isAnchored}
              >
                {confession.isAnchored ? <Check size={12} /> : <Zap size={12} />}
                {confession.isAnchored ? 'Anchored' : 'Anchor'}
              </button>
           </div>
         </SketchCard>
       ))}
     </div>
  </div>
);

const DetailView = ({ confession, onBack, handleVote, handleAnchor, userProfile }: { confession: Confession, onBack: () => void, handleVote: any, handleAnchor: any, userProfile: UserProfile }) => {
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  if (!confession) return <div>Confession not found</div>;

  const shareText = encodeURIComponent(`"${confession.displayText}" #CryptoConfessions`);
  const shareUrl = encodeURIComponent(window.location.href);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}?id=${confession.id}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
    setShowShareMenu(false);
  };

  const xShareLink = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;
  const warpcastShareLink = `https://warpcast.com/~/compose?text=${shareText}&embeds[]=${shareUrl}`;

  return (
    <div className="min-h-full flex flex-col animate-fade-in relative">
       <div className="flex items-center gap-4 mb-6 pt-2 sticky top-0 bg-paper/95 backdrop-blur-sm z-10 py-2">
          <button 
             onClick={onBack}
             className="p-2 border-2 border-black rounded-full hover:bg-black hover:text-white transition-colors"
          >
             <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-display font-black">Confession</h2>
       </div>

       <SketchCard className="mb-8 p-6" delay={0}>
           <div className="flex justify-between items-start mb-6">
             <Badge color="bg-teal text-lg py-1.5 px-4">{confession.category}</Badge>
             <div className="text-right">
                 <p className="text-sm font-bold">{new Date(confession.timestamp).toLocaleDateString()}</p>
                 <p className="text-xs font-mono text-gray-500">{new Date(confession.timestamp).toLocaleTimeString()}</p>
             </div>
           </div>
           
           <p className="font-sans text-2xl leading-relaxed mb-8 text-ink font-medium">
             "{confession.displayText}"
           </p>

           <div className="flex items-center justify-between border-t-2 border-black pt-4">
               <div className="flex gap-4">
                  <SketchVoteButton 
                      type="like" 
                      isActive={confession.userVote === 'like'}
                      onClick={(e) => handleVote(e, confession.id, 'like')}
                      count={confession.likes}
                  />
                  <SketchVoteButton 
                      type="dislike" 
                      isActive={confession.userVote === 'dislike'}
                      onClick={(e) => handleVote(e, confession.id, 'dislike')}
                      count={confession.dislikes}
                  />
               </div>
               
               <div className="relative">
                 <button 
                   onClick={() => setShowShareMenu(!showShareMenu)}
                   className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${showShareMenu ? 'bg-black text-white' : 'text-gray-500 hover:text-black hover:bg-gray-100'}`}
                 >
                   {linkCopied ? <Check size={18} className="text-green-500" /> : <Share2 size={18} />}
                   <span className="text-sm font-bold">{linkCopied ? 'Copied' : 'Share'}</span>
                 </button>

                 {showShareMenu && (
                   <div className="absolute bottom-full right-0 mb-3 min-w-[180px] bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2 z-20 animate-sketch-in origin-bottom-right flex flex-col gap-1">
                      <button 
                        onClick={handleCopyLink}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 rounded-lg w-full text-left transition-colors font-bold text-sm"
                      >
                        <Copy size={16} /> Copy Link
                      </button>
                      <a 
                        href={xShareLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 rounded-lg w-full text-left transition-colors font-bold text-sm"
                      >
                        <XIcon size={16} /> Post on X
                      </a>
                      <a 
                        href={warpcastShareLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 rounded-lg w-full text-left transition-colors font-bold text-sm text-purple-700"
                      >
                        <FarcasterIcon size={16} /> Warpcast
                      </a>
                   </div>
                 )}
               </div>
           </div>
           
           <div className="mt-4">
              <button 
                onClick={(e) => handleAnchor(e, confession.id)}
                disabled={confession.isAnchored}
                className={`w-full flex items-center justify-center gap-2 p-3 font-bold border-2 border-black rounded-lg transition-all shadow-sketch hover:shadow-sketch-hover ${confession.isAnchored ? 'bg-cyan text-white cursor-default' : 'bg-white hover:bg-gray-50'}`}
              >
                  {confession.isAnchored ? (
                      <>
                          <Check size={20} /> Anchored on Base
                      </>
                  ) : (
                      <>
                          <Zap size={20} className="fill-teal-300" /> Permanently Anchor on Base ($1.00)
                      </>
                  )}
              </button>
           </div>
       </SketchCard>

       <div className="bg-white border-2 border-black rounded-xl p-5 shadow-sketch mb-8 animate-sketch-in" style={{animationDelay: '100ms'}}>
           <h3 className="font-bold text-sm uppercase text-gray-400 mb-3 tracking-widest">Metadata</h3>
           <div className="space-y-3 font-mono text-sm">
               <div className="flex justify-between">
                   <span>Sentiment Score:</span>
                   <span className={confession.sentimentScore > 50 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                       {confession.sentimentScore}/100
                   </span>
               </div>
               <div className="flex justify-between items-center">
                   <span>Status:</span>
                   {confession.isAnchored ? (
                       <span className="flex items-center gap-1 text-cyan-600 font-bold">
                           <Check size={14} /> On-Chain
                       </span>
                   ) : (
                       <span className="text-gray-400">Off-Chain</span>
                   )}
               </div>
               {confession.isAnchored && confession.txHash && (
                   <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-300">
                       <span>Proof:</span>
                       <a 
                          href={`https://basescan.org/tx/${confession.txHash}`} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="flex items-center gap-1 text-blue-600 underline"
                          data-testid="link-tx-proof"
                        >
                           Verify on Base <ExternalLink size={12} />
                       </a>
                   </div>
               )}
           </div>
       </div>

    </div>
  );
};

const CATEGORIES: ConfessionCategory[] = ['Regret', 'FOMO', 'Greed', 'Wisdom', 'Rug', 'Other'];

interface SubmitViewProps {
  inputText: string;
  setInputText: (value: string) => void;
  selectedCategory: ConfessionCategory;
  setSelectedCategory: (value: ConfessionCategory) => void;
  isProcessing: boolean;
  handleSubmit: (paymentTxHash: string) => void;
  isConnected: boolean;
  onConnect: () => void;
  relayerAddress: string | null;
  feeWei: bigint;
}

const SubmitView = ({ inputText, setInputText, selectedCategory, setSelectedCategory, isProcessing, handleSubmit, isConnected, onConnect, relayerAddress, feeWei }: SubmitViewProps) => {
  const [feeDisplay, setFeeDisplay] = useState('$1.00');
  const [paymentStep, setPaymentStep] = useState<'write' | 'paying' | 'confirming' | 'submitting'>('write');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  
  const { sendTransaction, data: txHash, isPending: isSendPending, error: sendError, reset: resetSendTransaction } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    const draft = localStorage.getItem('confession_draft');
    if (draft) {
      setInputText(draft);
    }
  }, [setInputText]);

  useEffect(() => {
    localStorage.setItem('confession_draft', inputText);
  }, [inputText]);
  
  useEffect(() => {
    getConfessionFeeDisplay().then(setFeeDisplay).catch(() => setFeeDisplay('$1.00'));
  }, []);

  // Handle payment confirmation and submission
  useEffect(() => {
    if (isConfirmed && txHash && paymentStep === 'confirming') {
      console.log("Payment confirmed:", txHash);
      setPaymentStep('submitting');
      handleSubmit(txHash);
    }
  }, [isConfirmed, txHash, paymentStep, handleSubmit]);

  // Handle errors
  useEffect(() => {
    if (sendError) {
      console.error("Payment failed:", sendError);
      setPaymentError(sendError.message || "Payment failed. Please try again.");
      setPaymentStep('write');
      resetSendTransaction();
    }
    if (confirmError) {
      console.error("Confirmation failed:", confirmError);
      setPaymentError("Transaction confirmation failed. Please try again.");
      setPaymentStep('write');
      resetSendTransaction();
    }
  }, [sendError, confirmError, resetSendTransaction]);

  const initiatePayment = async () => {
    if (!inputText.trim()) {
      setPaymentError("Please write your confession first.");
      return;
    }
    
    if (!relayerAddress) {
      setPaymentError("Relayer not available. Please try again later.");
      return;
    }

    setPaymentError(null);
    setPaymentStep('paying');

    try {
      sendTransaction({
        to: relayerAddress as `0x${string}`,
        value: feeWei,
      });
      setPaymentStep('confirming');
    } catch (error: any) {
      console.error("Payment initiation failed:", error);
      setPaymentError(error.message || "Failed to initiate payment.");
      setPaymentStep('write');
    }
  };

  // Reset state when leaving or completing
  const resetPaymentState = () => {
    setPaymentStep('write');
    setPaymentError(null);
    resetSendTransaction();
  };

  if (!isConnected) {
      return (
        <div className="h-full flex flex-col items-center justify-center animate-fade-in text-center px-4">
            <Lock size={64} className="text-gray-300 mb-6" />
            <h2 className="text-3xl font-display font-black mb-2">Connect to Confess.</h2>
            <p className="text-gray-500 mb-8 max-w-xs">
                To anchor your confession on the blockchain, you need to connect your wallet. A small fee will be required.
            </p>
            
            <div className="w-full max-w-xs">
                 <SketchButton onClick={onConnect} className="w-full bg-teal hover:bg-teal/90 text-black border-black">
                     <Wallet className="mr-2" size={20} /> Connect Wallet
                 </SketchButton>
            </div>
        </div>
      )
  }

  const isPaymentInProgress = paymentStep !== 'write' || isProcessing;
  
  const getButtonText = () => {
    if (isProcessing || paymentStep === 'submitting') return "Anchoring on-chain...";
    if (paymentStep === 'confirming' || isConfirming) return "Confirming payment...";
    if (paymentStep === 'paying' || isSendPending) return "Waiting for wallet...";
    return `Pay ${feeDisplay} & Submit`;
  };

  return (
    <div className="h-full flex flex-col justify-center animate-fade-in">
      <h2 className="text-3xl font-display font-black mb-4">Confess.</h2>
      
      <div className="relative mb-4">
        <SketchInput 
          rows={6} 
          placeholder="I aped into..." 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isPaymentInProgress}
        />
        <div className="absolute -top-3 -right-3 -rotate-12 bg-yellow-200 border-2 border-black px-3 py-1 shadow-sm font-hand text-xs font-bold transform">
          Anonymous
        </div>
      </div>

      <div className="mb-4">
        <p className="text-xs font-bold text-gray-500 mb-2">Pick a vibe:</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => !isPaymentInProgress && setSelectedCategory(cat)}
              disabled={isPaymentInProgress}
              className={`px-3 py-1.5 border-2 border-black rounded-md font-bold text-sm transition-all ${
                selectedCategory === cat 
                  ? 'bg-black text-white' 
                  : 'bg-white hover:bg-gray-100'
              } ${isPaymentInProgress ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              #{cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 px-2">
         <span className="text-xs text-gray-400 font-mono">
             <span className="text-cyan font-bold mr-1">On-Chain</span>
             (Anchored to Base)
         </span>
        <span className="text-xs text-gray-400 font-mono">{inputText.length}/1000</span>
      </div>
      
      <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-3 mb-4 text-center">
        <span className="text-sm text-gray-600">
          Fee: <span className="font-bold text-black">{feeDisplay}</span> + gas
        </span>
        <p className="text-xs text-gray-400 mt-1">Paid to keep your identity hidden</p>
      </div>

      {paymentError && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 mb-4 text-center">
          <span className="text-sm text-red-600">{paymentError}</span>
          <button 
            onClick={resetPaymentState}
            className="block mx-auto mt-2 text-xs text-red-500 underline"
          >
            Try again
          </button>
        </div>
      )}

      <SketchButton 
        isLoading={isPaymentInProgress} 
        onClick={initiatePayment} 
        className="w-full"
        icon={Send}
        disabled={isPaymentInProgress || !inputText.trim()}
      >
        {getButtonText()}
      </SketchButton>
      
      {paymentStep !== 'write' && (
        <p className="text-xs text-center text-gray-400 mt-3">
          {paymentStep === 'paying' && "Approve the transaction in your wallet..."}
          {paymentStep === 'confirming' && "Waiting for blockchain confirmation..."}
          {paymentStep === 'submitting' && "Payment verified! Anchoring your confession..."}
        </p>
      )}
    </div>
  );
};

interface TrendsData {
  total: number;
  anchored: number;
  anchoredPercent: number;
  topCategory: string;
  categories: { name: string; count: number; percent: number }[];
  topConfessions: { id: string; text: string; likes: number; category: string }[];
  totalLikes: number;
}

const TrendsView = () => {
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/trends')
      .then(res => {
        if (!res.ok) throw new Error('API error');
        return res.json();
      })
      .then(data => {
        if (data && (typeof data.total === 'number' || typeof data.totalConfessions === 'number')) {
          let categoryArr: { name: string; count: number; percent: number }[] = [];
          
          if (data.categoryBreakdown) {
            categoryArr = Object.entries(data.categoryBreakdown).map(([name, info]: [string, any]) => ({
              name,
              count: info.count || 0,
              percent: info.percentage || 0,
            }));
          } else if (data.categories) {
            categoryArr = data.categories;
          }
          
          const topCat = data.topCategory || (categoryArr.length > 0 
            ? categoryArr.reduce((a, b) => (b.count > a.count ? b : a), { name: 'Other', count: 0 }).name 
            : 'Other');
          
          setTrends({
            total: data.total ?? data.totalConfessions ?? 0,
            anchored: data.anchored ?? data.anchoredConfessions ?? 0,
            anchoredPercent: data.anchoredPercent ?? data.anchoredPercentage ?? 0,
            topCategory: topCat,
            categories: categoryArr,
            topConfessions: data.topConfessions || [],
            totalLikes: data.totalLikes || 0,
          });
        } else {
          setError(true);
        }
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h2 className="text-3xl font-display font-black">Pulse.</h2>
        <div className="text-center py-12 text-gray-400">Loading trends...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h2 className="text-3xl font-display font-black">Pulse.</h2>
        <SketchCard className="text-center py-8">
          <p className="text-gray-500">Unable to load trends. Please try again later.</p>
        </SketchCard>
      </div>
    );
  }

  if (!trends || trends.total === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h2 className="text-3xl font-display font-black">Pulse.</h2>
        <SketchCard className="text-center py-8">
          <p className="text-gray-500">No confessions yet. Be the first to confess!</p>
        </SketchCard>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-3xl font-display font-black">Pulse.</h2>
      
      <SketchCard className="bg-ink text-white" delay={0}>
        <div className="flex items-center gap-2 mb-2 text-cyan">
          <Zap size={18} />
          <span className="text-xs font-bold uppercase tracking-widest">Top Vibe</span>
        </div>
        <p className="font-display text-3xl">#{trends.topCategory}</p>
      </SketchCard>

      <div className="grid grid-cols-3 gap-3">
        <SketchCard className="text-center p-4" delay={1}>
          <p className="text-2xl font-black">{trends.total}</p>
          <p className="text-xs text-gray-500">Confessions</p>
        </SketchCard>
        <SketchCard className="text-center p-4" delay={2}>
          <p className="text-2xl font-black">{trends.anchored}</p>
          <p className="text-xs text-gray-500">On-Chain</p>
        </SketchCard>
        <SketchCard className="text-center p-4" delay={3}>
          <p className="text-2xl font-black">{trends.totalLikes}</p>
          <p className="text-xs text-gray-500">Total Likes</p>
        </SketchCard>
      </div>

      <SketchCard delay={4}>
        <h3 className="font-bold mb-4">Category Breakdown</h3>
        <div className="space-y-3">
          {trends.categories.slice(0, 5).map((cat, i) => (
            <div key={cat.name} className="flex items-center gap-3">
              <span className="font-bold text-sm w-20">#{cat.name}</span>
              <div className="flex-1 h-4 bg-gray-100 border border-black rounded-full overflow-hidden">
                <div 
                  className="h-full bg-teal transition-all" 
                  style={{ width: `${cat.percent}%` }}
                />
              </div>
              <span className="text-xs font-mono w-12 text-right">{cat.percent}%</span>
            </div>
          ))}
        </div>
      </SketchCard>

      {trends.topConfessions.length > 0 && (
        <SketchCard delay={5}>
          <h3 className="font-bold mb-4">Hot Confessions</h3>
          <div className="space-y-3">
            {trends.topConfessions.map((conf, i) => (
              <div key={conf.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                <span className="text-lg font-black text-gray-300">#{i+1}</span>
                <div className="flex-1">
                  <p className="text-sm">{conf.text}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge color="bg-teal-dim text-xs">{conf.category}</Badge>
                    <span className="text-xs text-gray-400">{conf.likes} likes</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SketchCard>
      )}
    </div>
  );
};

const ProfileView = ({ isConnected, walletAddress, handleConnect, onLogout, stats }: { isConnected: boolean, walletAddress: string | undefined, handleConnect: () => void, onLogout: () => void, stats: { total: number, anchored: number } }) => {
  return (
    <div className="h-full flex flex-col items-center justify-center animate-fade-in">
        <div className="relative">
            <div className="w-24 h-24 bg-teal rounded-full border-2 border-black shadow-sketch mb-6 flex items-center justify-center animate-sketch-in overflow-hidden">
                <User size={48} />
            </div>
            {isConnected && (
                <div className="absolute -top-1 -right-2 bg-white border-2 border-black p-1.5 rounded-full shadow-sm animate-sketch-in" style={{animationDelay: '200ms'}}>
                   <Wallet size={16} />
                </div>
            )}
        </div>
    
        <h2 className="text-2xl font-black mb-1 animate-sketch-in" style={{animationDelay: '100ms'}}>
            {isConnected ? 'Connected' : 'Anonymous User'}
        </h2>
        
        <div className="text-gray-500 font-mono text-sm mb-8 animate-sketch-in flex flex-col items-center gap-1" style={{animationDelay: '200ms'}}>
            {walletAddress && (
                <span className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                    <Wallet size={12} />
                    {walletAddress.slice(0,6)}...{walletAddress.slice(-4)}
                </span>
            )}
            {!isConnected && 'Not Connected'}
        </div>

        {isConnected && (
            <div className="space-y-4 w-full max-w-xs animate-sketch-in mb-8" style={{animationDelay: '300ms'}}>
                <div className="flex items-center justify-between p-4 border-2 border-black rounded-lg bg-white">
                <span className="font-bold">Total Confessions</span>
                <span className="font-mono bg-black text-white px-2 py-0.5 rounded">{stats.total}</span>
                </div>
                <div className="flex items-center justify-between p-4 border-2 border-black rounded-lg bg-white">
                <span className="font-bold">Base Anchors</span>
                <span className="font-mono bg-cyan text-black px-2 py-0.5 rounded">{stats.anchored}</span>
                </div>
            </div>
        )}

        <div className="animate-sketch-in w-full max-w-xs space-y-3" style={{animationDelay: '300ms'}}>
            {!isConnected && (
                 <SketchButton onClick={handleConnect} className="w-full bg-teal hover:bg-teal/90 text-black border-black">
                     <Wallet className="mr-2" size={20} /> Connect Wallet
                 </SketchButton>
            )}

            {isConnected && (
                <SketchButton onClick={onLogout} variant="danger" className="w-full mt-4">
                     <LogOut className="mr-2" size={20} /> Disconnect
                </SketchButton>
            )}
        </div>

        <div className="mt-12 text-center animate-sketch-in opacity-50" style={{animationDelay: '500ms'}}>
        <p className="text-xs text-gray-400 mb-2">Powered by</p>
        <div className="flex justify-center gap-2 text-xs font-bold items-center">
            <span>BASE</span>
            <span className="text-gray-300">•</span>
            <span>FARCASTER</span>
        </div>
        </div>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<AppView>(AppView.HOME);
  const [activeConfessionId, setActiveConfessionId] = useState<string | null>(null);
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<'latest' | 'top'>('latest');
  
  const [inputText, setInputText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ConfessionCategory>('Other');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingConfessionText, setPendingConfessionText] = useState<string | null>(null);
  const [pendingCategory, setPendingCategory] = useState<ConfessionCategory>('Other');
  
  // Relayer info for payment
  const [relayerAddress, setRelayerAddress] = useState<string | null>(null);
  const [feeWei, setFeeWei] = useState<bigint>(BigInt(330000000000000)); // Default ~$1

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  // Fetch relayer info on mount
  useEffect(() => {
    const fetchRelayerInfo = async () => {
      try {
        const response = await fetch('/api/relayer/info');
        if (response.ok) {
          const data = await response.json();
          if (data.enabled && data.relayerAddress) {
            setRelayerAddress(data.relayerAddress);
            if (data.feeWei) {
              setFeeWei(BigInt(data.feeWei));
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch relayer info:", e);
      }
    };
    fetchRelayerInfo();
  }, []);

  useEffect(() => {
    const loadConfessions = async () => {
      setIsLoading(true);
      const data = await fetchConfessions();
      setConfessions(data);
      setIsLoading(false);
    };
    loadConfessions();
  }, []);

  const handleConnect = () => {
    if (connectors.length === 0) {
      alert("No wallet found. Please install a wallet extension or use Warpcast.");
      return;
    }
    
    // Try injected connector first (MetaMask, etc), then coinbase, then farcaster miniApp
    const injectedConnector = connectors.find(c => c.id === 'injected');
    const coinbaseConnector = connectors.find(c => c.id === 'coinbaseWalletSDK');
    const miniAppConnector = connectors.find(c => c.id === 'farcasterMiniApp');
    
    const preferredConnector = injectedConnector || coinbaseConnector || miniAppConnector || connectors[0];
    
    if (preferredConnector) {
      connect({ connector: preferredConnector });
    }
  };

  const handleLogout = () => {
    disconnect();
  };

  const handleSubmit = useCallback(async (paymentTxHash: string) => {
    if (!inputText.trim()) return;
    
    if (!isConnected) {
      alert("Please connect your wallet first.");
      return;
    }
    
    if (!isAnchoringEnabled()) {
      alert("On-chain anchoring is not configured. Please set the contract address.");
      return;
    }
    
    setIsProcessing(true);
    setPendingConfessionText(inputText);
    setPendingCategory(selectedCategory);

    try {
      // Submit confession with payment proof
      const relayerResponse = await fetch('/api/relayer/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confessionText: inputText,
          category: selectedCategory,
          paymentTxHash: paymentTxHash,
        }),
      });

      const relayerData = await relayerResponse.json();
      
      if (relayerResponse.ok && relayerData.success) {
        // Relayer submitted successfully - fully anonymous!
        console.log("Anonymous confession submitted via relayer:", relayerData.txHash);
        
        if (relayerData.confession) {
          setConfessions(prev => [{
            ...relayerData.confession,
            displayText: relayerData.confession.displayText || relayerData.confession.originalText,
            timestamp: typeof relayerData.confession.timestamp === 'number' && relayerData.confession.timestamp < 10000000000 
              ? relayerData.confession.timestamp * 1000 
              : new Date(relayerData.confession.timestamp).getTime(),
            userVote: null,
          }, ...prev]);
        }
        
        localStorage.removeItem('confession_draft');
        setInputText('');
        setSelectedCategory('Other');
        setPendingConfessionText(null);
        setPendingCategory('Other');
        setIsProcessing(false);
        setView(AppView.HOME);
        return;
      }
      
      // Rate limit or other error
      if (relayerData.retryAfter) {
        throw new Error("Too many submissions. Please wait an hour before trying again.");
      }
      
      // Payment verification failed
      if (relayerData.error?.includes('Payment')) {
        throw new Error(relayerData.error);
      }
      
      // Other error
      throw new Error(relayerData.error || "Failed to submit confession");

    } catch (error: any) {
      console.error("Failed to submit confession:", error);
      alert(error.message || "Failed to submit confession.");
      setIsProcessing(false);
      setPendingConfessionText(null);
    }
  }, [inputText, selectedCategory, isConnected, setView]);

  const handleAnchor = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    if (!isConnected) {
      handleConnect();
      return;
    }
    
    const targetConfession = confessions.find(c => c.id === id);
    if (!targetConfession || targetConfession.isAnchored) return;

    // Use the relayer to anchor existing confessions anonymously
    try {
      setIsProcessing(true);
      
      const relayerResponse = await fetch('/api/relayer/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confessionText: targetConfession.displayText,
          category: targetConfession.category,
        }),
      });

      const relayerData = await relayerResponse.json();
      
      if (relayerResponse.ok && relayerData.success) {
        // Update the confession in state
        setConfessions(prev => prev.map(c => 
          c.id === id ? { ...c, isAnchored: true, txHash: relayerData.txHash } : c
        ));
        alert("Confession anchored anonymously!");
      } else if (relayerData.retryAfter) {
        alert("Too many submissions. Please wait an hour before trying again.");
      } else {
        alert(relayerData.error || "Anonymous anchoring is temporarily unavailable. Please try again later.");
      }
    } catch (e) {
      console.error("Failed to anchor", e);
      alert("Failed to anchor confession. Please try again later.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVote = async (e: React.MouseEvent, id: string, type: 'like' | 'dislike') => {
    setConfessions(prev => prev.map(c => {
        if (c.id !== id) return c;
        
        let newLikes = c.likes;
        let newDislikes = c.dislikes;

        if (c.userVote === 'like') newLikes--;
        if (c.userVote === 'dislike') newDislikes--;

        if (type === 'like') newLikes++;
        if (type === 'dislike') newDislikes++;

        return { ...c, userVote: type, likes: newLikes, dislikes: newDislikes };
    }));

    const updated = await voteOnConfession(id, type);
    if (updated) {
      setConfessions(prev => prev.map(c => 
        c.id === id ? { ...c, likes: updated.likes, dislikes: updated.dislikes, userVote: updated.userVote } : c
      ));
    }
  };

  const openConfessionDetail = (id: string) => {
      setActiveConfessionId(id);
      setView(AppView.DETAIL);
  };

  const toggleFilter = () => {
    setFilterMode(prev => prev === 'latest' ? 'top' : 'latest');
  };

  const getFilteredConfessions = () => {
    let sorted = [...confessions];
    if (filterMode === 'top') {
        sorted.sort((a, b) => b.likes - a.likes);
    } else {
        sorted.sort((a, b) => b.timestamp - a.timestamp);
    }
    return sorted;
  };

  const displayConfessions = getFilteredConfessions();
  const userProfile: UserProfile = { walletAddress: address || null, farcaster: null };
  
  const profileStats = useMemo(() => ({
    total: confessions.length,
    anchored: confessions.filter(c => c.isAnchored).length
  }), [confessions]);

  return (
    <div className="fixed inset-0 flex justify-center bg-gray-100 overflow-hidden">
      <div className="w-full max-w-md bg-paper h-full shadow-2xl relative">
        
        <main className="absolute inset-0 overflow-y-auto no-scrollbar p-5 pb-32">
          {view === AppView.HOME && (
            <HomeView 
              confessions={displayConfessions} 
              openConfessionDetail={openConfessionDetail}
              handleVote={handleVote}
              handleAnchor={handleAnchor}
              userProfile={userProfile}
            />
          )}
          {view === AppView.DETAIL && activeConfessionId && (
            <DetailView 
              confession={confessions.find(c => c.id === activeConfessionId)!} 
              onBack={() => setView(AppView.HOME)}
              handleVote={handleVote}
              handleAnchor={handleAnchor}
              userProfile={userProfile}
            />
          )}
          {view === AppView.SUBMIT && (
            <SubmitView 
              inputText={inputText}
              setInputText={setInputText}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              isProcessing={isProcessing}
              handleSubmit={handleSubmit}
              isConnected={isConnected}
              onConnect={handleConnect}
              relayerAddress={relayerAddress}
              feeWei={feeWei}
            />
          )}
          {view === AppView.TRENDS && <TrendsView />}
          {view === AppView.PROFILE && (
            <ProfileView 
              isConnected={isConnected} 
              walletAddress={address}
              handleConnect={handleConnect} 
              onLogout={handleLogout} 
              stats={profileStats} 
            />
          )}
        </main>

        <div className="absolute bottom-0 left-0 right-0 px-4 pb-6 pt-2 z-50 pointer-events-none">
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-paper via-paper/95 to-transparent -z-10 pointer-events-none"></div>

            <div className="pointer-events-auto relative">
                <nav className="w-full bg-white border-2 border-black rounded-full shadow-[0px_4px_10px_rgba(0,0,0,0.1)] flex justify-between items-center px-2 py-2">
                    <NavBtn 
                        icon={Home} 
                        active={view === AppView.HOME || view === AppView.DETAIL} 
                        onClick={() => setView(AppView.HOME)} 
                        label="Feed"
                    />
                    <NavBtn 
                        icon={TrendingUp} 
                        active={view === AppView.TRENDS} 
                        onClick={() => setView(AppView.TRENDS)} 
                        label="Trends"
                    />
                    
                    <div className="relative -top-8">
                        <button 
                        onClick={() => setView(AppView.SUBMIT)}
                        className={`w-14 h-14 rounded-full border-2 border-black flex items-center justify-center shadow-sketch transition-transform hover:-translate-y-1 ${view === AppView.SUBMIT ? 'bg-black text-white' : 'bg-teal text-black'}`}
                        >
                        <PenTool size={24} />
                        </button>
                    </div>

                    <NavBtn 
                        icon={Lock} 
                        active={view === AppView.PROFILE} 
                        onClick={() => setView(AppView.PROFILE)} 
                        label="Profile"
                    />
                    <NavBtn 
                        icon={Filter} 
                        active={false} 
                        onClick={toggleFilter} 
                        label={filterMode === 'top' ? 'Top' : 'Latest'}
                    />
                </nav>
            </div>
        </div>
      </div>
    </div>
  );
}
