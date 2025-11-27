import { useState, useEffect, useRef } from 'react';
import { createWalletClient, createPublicClient, custom, http, formatEther } from 'viem';
import { base, sepolia } from 'viem/chains';
import { ArrowLeft, DollarSign, Wallet, RefreshCw, Download, Save, Settings, Database, TrendingUp, ExternalLink, Check, AlertTriangle, Eye, EyeOff, Shield, Lock, KeyRound } from 'lucide-react';
import { SketchButton, SketchCard, Badge } from '../components/SketchComponents';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '';

function PasswordGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsChecking(true);
    setError('');
    
    try {
      const response = await fetch('/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      
      if (response.ok) {
        sessionStorage.setItem('adminAuth', 'true');
        onAuthenticated();
      } else {
        setError('Invalid password');
      }
    } catch (e) {
      setError('Connection error');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <SketchCard delay={0} className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-black">
            <Lock size={32} className="text-primary" />
          </div>
          <h1 className="font-display text-xl font-bold">Admin Access</h1>
          <p className="text-sm text-gray-500 mt-1">Enter password to continue</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full border-2 border-black rounded-xl px-4 py-3 pl-10 font-mono text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
              data-testid="input-admin-password"
            />
          </div>
          
          {error && (
            <div className="p-3 bg-red-50 border-2 border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}
          
          <SketchButton
            type="submit"
            disabled={isChecking || !password}
            icon={Lock}
            className="w-full"
            data-testid="button-unlock"
          >
            {isChecking ? 'Checking...' : 'Unlock'}
          </SketchButton>
        </form>
        
        <div className="mt-6 pt-4 border-t border-gray-200 text-center">
          <a href="/" className="text-xs text-gray-500 hover:text-primary flex items-center justify-center gap-1">
            <ArrowLeft size={12} /> Back to app
          </a>
        </div>
      </SketchCard>
    </div>
  );
}

const ABI = [
  {
    inputs: [],
    name: "owner",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "feeUsdCents",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getEthPrice",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getFeeInWei",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "totalConfessions",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getBalance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ type: "uint256", name: "_newFeeUsdCents" }],
    name: "setFee",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];

type NetworkType = 'base' | 'sepolia';

const NETWORKS = {
  base: {
    chain: base,
    name: 'Base',
    explorer: 'https://basescan.org',
    rpcUrls: [
      'https://base-mainnet.g.alchemy.com/v2/demo',
      'https://1rpc.io/base',
      'https://base.llamarpc.com',
      'https://mainnet.base.org',
    ]
  },
  sepolia: {
    chain: sepolia,
    name: 'Sepolia',
    explorer: 'https://sepolia.etherscan.io',
    rpcUrls: ['https://rpc.sepolia.org']
  }
};

interface Confession {
  id: string;
  displayText: string;
  category: string;
  likes: number;
  dislikes: number;
  isAnchored: boolean;
  isHidden?: boolean;
  txHash: string | null;
  timestamp: number;
}

interface DbStats {
  totalConfessions: number;
  anchoredCount: number;
  totalVotes: number;
  hiddenCount: number;
}

const getProvider = () => {
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    return (window as any).ethereum;
  }
  return null;
};

function AdminPanel() {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'contract' | 'database'>('contract');
  const [network, setNetwork] = useState<NetworkType>('base');
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const [adminSession, setAdminSession] = useState<string>('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [contractData, setContractData] = useState({
    owner: '',
    feeUsdCents: '0',
    feeWei: '0',
    feeEth: '0',
    ethPrice: '0',
    balance: '0',
    balanceEth: '0',
    totalConfessions: '0',
  });

  const [dbStats, setDbStats] = useState<DbStats>({
    totalConfessions: 0,
    anchoredCount: 0,
    totalVotes: 0,
    hiddenCount: 0,
  });

  const [allConfessions, setAllConfessions] = useState<Confession[]>([]);
  const [newFeeUsd, setNewFeeUsd] = useState('1.00');

  const feePresets = [
    { label: '$0.25', cents: 25 },
    { label: '$0.50', cents: 50 },
    { label: '$1.00', cents: 100 },
    { label: '$2.00', cents: 200 },
  ];

  const connectWallet = async () => {
    const provider = getProvider();
    if (!provider) {
      setError('No wallet found. Install MetaMask or use Farcaster.');
      return;
    }

    try {
      const selectedNetwork = NETWORKS[network];
      const client = createWalletClient({
        chain: selectedNetwork.chain,
        transport: custom(provider)
      });
      const [address] = await client.requestAddresses();
      setWalletAddress(address);
      setIsConnected(true);
      await loadContractData(address);
    } catch (e: any) {
      setError(e.message || 'Failed to connect');
    }
  };

  const loadContractData = async (userAddress?: string) => {
    if (!CONTRACT_ADDRESS) {
      setError('Set VITE_CONTRACT_ADDRESS in environment.');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const selectedNetwork = NETWORKS[network];
      
      let publicClient;
      let lastError;
      for (const rpcUrl of selectedNetwork.rpcUrls) {
        try {
          publicClient = createPublicClient({
            chain: selectedNetwork.chain,
            transport: http(rpcUrl)
          });
          await publicClient.getBlockNumber();
          break;
        } catch (e) {
          lastError = e;
          continue;
        }
      }
      
      if (!publicClient) {
        throw lastError || new Error('All RPC endpoints failed');
      }

      const [owner, feeUsdCents, feeWei, ethPrice, balance, total] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: ABI,
          functionName: 'owner',
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: ABI,
          functionName: 'feeUsdCents',
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: ABI,
          functionName: 'getFeeInWei',
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: ABI,
          functionName: 'getEthPrice',
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: ABI,
          functionName: 'getBalance',
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: ABI,
          functionName: 'totalConfessions',
        }),
      ]);

      const feeWeiStr = (feeWei as bigint).toString();
      const balanceStr = (balance as bigint).toString();
      const ethPriceNum = Number(ethPrice) / 1e8;
      const feeUsdNum = Number(feeUsdCents) / 100;
      const correctFeeEth = ethPriceNum > 0 ? (feeUsdNum / ethPriceNum).toFixed(8) : '0';

      setContractData({
        owner: owner as string,
        feeUsdCents: (feeUsdCents as bigint).toString(),
        feeWei: feeWeiStr,
        feeEth: correctFeeEth,
        ethPrice: ethPriceNum.toFixed(2),
        balance: balanceStr,
        balanceEth: formatEther(BigInt(balanceStr)),
        totalConfessions: (total as bigint).toString(),
      });

      setNewFeeUsd((Number(feeUsdCents) / 100).toString());

      const addr = userAddress || walletAddress;
      setIsOwner(addr ? (owner as string).toLowerCase() === addr.toLowerCase() : false);
    } catch (e: any) {
      console.error('Load error:', e);
      setError(`Failed to load. Check network and contract.`);
    } finally {
      setLoading(false);
    }
  };

  const loadDbData = async (sessionToken?: string) => {
    try {
      const headers: Record<string, string> = {};
      const currentSession = sessionToken || adminSession;
      if (currentSession) {
        headers['X-Admin-Session'] = currentSession;
      }
      
      const url = currentSession ? '/api/confessions?includeHidden=true' : '/api/confessions';
      const response = await fetch(url, { headers });
      
      if (response.ok) {
        const confessions: Confession[] = await response.json();
        setAllConfessions(confessions);
        
        const anchored = confessions.filter(c => c.isAnchored).length;
        const hidden = confessions.filter(c => c.isHidden).length;
        const totalVotes = confessions.reduce((sum, c) => sum + c.likes + c.dislikes, 0);
        
        setDbStats({
          totalConfessions: confessions.length,
          anchoredCount: anchored,
          totalVotes: totalVotes,
          hiddenCount: hidden,
        });
      }
    } catch (e) {
      console.error('DB load error:', e);
    }
  };

  const authenticateAsAdmin = async () => {
    if (!walletAddress || !isOwner) {
      setError('Must be contract owner to authenticate');
      return;
    }
    
    const provider = getProvider();
    if (!provider) {
      setError('No wallet provider found');
      return;
    }
    
    setIsAuthenticating(true);
    setError('');
    
    try {
      const nonceRes = await fetch('/api/admin/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });
      
      if (!nonceRes.ok) {
        throw new Error('Failed to get nonce');
      }
      
      const { message } = await nonceRes.json();
      
      const selectedNetwork = NETWORKS[network];
      const client = createWalletClient({
        chain: selectedNetwork.chain,
        transport: custom(provider)
      });
      
      const signature = await client.signMessage({
        account: walletAddress as `0x${string}`,
        message,
      });
      
      const verifyRes = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, signature, message }),
      });
      
      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || 'Authentication failed');
      }
      
      const { sessionToken } = await verifyRes.json();
      setAdminSession(sessionToken);
      setSuccess('Authenticated as admin');
      setTimeout(() => setSuccess(''), 2000);
      await loadDbData(sessionToken);
    } catch (e: any) {
      setError(e.message || 'Authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const toggleVisibility = async (id: string, currentlyHidden: boolean) => {
    if (!adminSession) {
      setError('Authenticate first');
      return;
    }
    
    try {
      const response = await fetch(`/api/confessions/${id}/visibility`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'X-Admin-Session': adminSession,
        },
        body: JSON.stringify({ isHidden: !currentlyHidden }),
      });
      
      if (response.ok) {
        setSuccess(currentlyHidden ? 'Confession shown' : 'Confession hidden');
        await loadDbData();
        setTimeout(() => setSuccess(''), 2000);
      } else if (response.status === 401) {
        setAdminSession('');
        setError('Session expired - please re-authenticate');
      } else if (response.status === 403) {
        setError('Not authorized to moderate');
      } else {
        setError('Failed to update visibility');
      }
    } catch (e) {
      setError('Failed to update visibility');
    }
  };

  useEffect(() => {
    loadDbData();
  }, []);

  useEffect(() => {
    if (isConnected && activeTab === 'contract') {
      autoRefreshRef.current = setInterval(() => {
        loadContractData();
      }, 30000);
    }
    
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [isConnected, activeTab, network]);

  const ensureCorrectChain = async (provider: any) => {
    const selectedNetwork = NETWORKS[network];
    const chainId = selectedNetwork.chain.id;
    
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
      return true;
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${chainId.toString(16)}`,
              chainName: selectedNetwork.name,
              rpcUrls: selectedNetwork.rpcUrls,
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: [selectedNetwork.explorer],
            }],
          });
          return true;
        } catch (addError) {
          setError('Please add the network to your wallet');
          return false;
        }
      }
      if (switchError.code === 4001) {
        setError('Please switch to Base network in your wallet');
        return false;
      }
      throw switchError;
    }
  };

  const updateFee = async () => {
    if (!isOwner) {
      setError('Only owner can update fee');
      return;
    }

    const provider = getProvider();
    if (!provider) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const switched = await ensureCorrectChain(provider);
      if (!switched) {
        setLoading(false);
        return;
      }

      const selectedNetwork = NETWORKS[network];
      const client = createWalletClient({
        chain: selectedNetwork.chain,
        transport: custom(provider)
      });

      const newFeeCents = Math.round(parseFloat(newFeeUsd) * 100);

      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: ABI,
        functionName: 'setFee',
        args: [BigInt(newFeeCents)],
        account: walletAddress as `0x${string}`,
      });

      setSuccess(`Fee updated! Tx: ${hash.slice(0, 10)}...`);
      setTimeout(() => loadContractData(), 3000);
    } catch (e: any) {
      setError(e.message || 'Failed to update fee');
    } finally {
      setLoading(false);
    }
  };

  const withdrawFunds = async () => {
    if (!isOwner) {
      setError('Only owner can withdraw');
      return;
    }

    if (contractData.balance === '0') {
      setError('No funds');
      return;
    }

    const provider = getProvider();
    if (!provider) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const switched = await ensureCorrectChain(provider);
      if (!switched) {
        setLoading(false);
        return;
      }

      const selectedNetwork = NETWORKS[network];
      const client = createWalletClient({
        chain: selectedNetwork.chain,
        transport: custom(provider)
      });

      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: ABI,
        functionName: 'withdraw',
        account: walletAddress as `0x${string}`,
      });

      setSuccess(`Withdrawn! Tx: ${hash.slice(0, 10)}...`);
      setTimeout(() => loadContractData(), 3000);
    } catch (e: any) {
      setError(e.message || 'Withdraw failed');
    } finally {
      setLoading(false);
    }
  };

  const switchNetwork = async (newNetwork: NetworkType) => {
    setNetwork(newNetwork);
    setError('');
    setSuccess('');
    if (isConnected) {
      await loadContractData(walletAddress);
    }
  };

  const balanceUsd = contractData.ethPrice !== '0' 
    ? (parseFloat(contractData.balanceEth) * parseFloat(contractData.ethPrice)).toFixed(2)
    : '0.00';

  return (
    <div className="fixed inset-0 flex justify-center bg-gray-100 overflow-hidden">
      <div className="w-full max-w-md bg-paper h-full shadow-2xl relative">
        <main className="absolute inset-0 overflow-y-auto no-scrollbar p-4 pb-8">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-5 gap-2">
            <a href="/" className="flex items-center gap-2 font-bold text-ink hover:text-teal transition-colors" data-testid="link-back">
              <ArrowLeft size={20} strokeWidth={2.5} /> Back
            </a>
            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => switchNetwork('base')}
                className={`px-2.5 py-1 border-2 border-black rounded-full text-xs font-bold transition-all ${
                  network === 'base' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
                }`}
                data-testid="button-network-base"
              >
                Base
              </button>
              <button
                onClick={() => switchNetwork('sepolia')}
                className={`px-2.5 py-1 border-2 border-black rounded-full text-xs font-bold transition-all ${
                  network === 'sepolia' ? 'bg-yellow-400 text-black' : 'bg-white hover:bg-gray-100'
                }`}
                data-testid="button-network-sepolia"
              >
                Test
              </button>
            </div>
          </div>

          {/* Title */}
          <div className="mb-5">
            <h1 className="text-2xl font-display font-black">Admin.</h1>
            <p className="text-gray-500 text-xs">Manage confessions & contract</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setActiveTab('contract')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border-2 border-black rounded-lg font-bold text-sm transition-all ${
                activeTab === 'contract' ? 'bg-black text-white shadow-sketch' : 'bg-white hover:bg-gray-50'
              }`}
              data-testid="tab-contract"
            >
              <Settings size={14} /> Contract
            </button>
            <button
              onClick={() => setActiveTab('database')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border-2 border-black rounded-lg font-bold text-sm transition-all ${
                activeTab === 'database' ? 'bg-black text-white shadow-sketch' : 'bg-white hover:bg-gray-50'
              }`}
              data-testid="tab-database"
            >
              <Shield size={14} /> Moderate
            </button>
          </div>

          {/* Alerts */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border-2 border-red-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="text-red-500 flex-shrink-0" size={18} />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border-2 border-green-200 rounded-lg flex items-start gap-2">
              <Check className="text-green-500 flex-shrink-0" size={18} />
              <p className="text-green-700 text-sm">{success}</p>
            </div>
          )}

          {/* Contract Tab */}
          {activeTab === 'contract' && (
            <div className="space-y-4">
              {!CONTRACT_ADDRESS ? (
                <SketchCard delay={0}>
                  <div className="text-center py-6">
                    <AlertTriangle size={36} className="mx-auto text-yellow-500 mb-3" />
                    <p className="font-bold text-sm">No Contract Configured</p>
                    <p className="text-xs text-gray-500">Set VITE_CONTRACT_ADDRESS</p>
                  </div>
                </SketchCard>
              ) : !isConnected ? (
                <SketchCard delay={0}>
                  <div className="text-center py-6">
                    <Wallet size={40} className="mx-auto text-gray-300 mb-3" />
                    <h2 className="text-lg font-display font-black mb-2">Connect Wallet</h2>
                    <p className="text-gray-500 text-xs mb-4">Connect owner wallet to manage.</p>
                    <SketchButton onClick={connectWallet} icon={Wallet} data-testid="button-connect-wallet">
                      Connect
                    </SketchButton>
                    <p className="text-xs text-gray-400 mt-3 font-mono">
                      {CONTRACT_ADDRESS.slice(0, 8)}...{CONTRACT_ADDRESS.slice(-6)}
                    </p>
                  </div>
                </SketchCard>
              ) : (
                <>
                  {/* Stats Card */}
                  <SketchCard delay={0}>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-bold text-sm flex items-center gap-1.5">
                        <TrendingUp size={16} /> Stats
                      </h3>
                      <button
                        onClick={() => loadContractData()}
                        disabled={loading}
                        className="p-1.5 hover:bg-gray-100 rounded-lg border-2 border-black transition-colors"
                        data-testid="button-refresh"
                      >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-paper border-2 border-dashed border-gray-300 rounded-lg p-2.5">
                        <p className="text-[10px] text-gray-500 font-bold uppercase">Fee</p>
                        <p className="text-xl font-black" data-testid="text-current-fee">
                          ${(Number(contractData.feeUsdCents) / 100).toFixed(2)}
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono">{parseFloat(contractData.feeEth).toFixed(6)} ETH</p>
                      </div>

                      <div className="bg-teal-50 border-2 border-dashed border-teal-300 rounded-lg p-2.5">
                        <p className="text-[10px] text-gray-500 font-bold uppercase">Balance</p>
                        <p className="text-xl font-black text-teal-600" data-testid="text-balance">
                          ${balanceUsd}
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono">{parseFloat(contractData.balanceEth).toFixed(6)} ETH</p>
                      </div>

                      <div className="bg-cyan-50 border-2 border-dashed border-cyan-300 rounded-lg p-2.5">
                        <p className="text-[10px] text-gray-500 font-bold uppercase">On-Chain</p>
                        <p className="text-xl font-black text-cyan-600" data-testid="text-onchain-count">
                          {contractData.totalConfessions}
                        </p>
                        <p className="text-[10px] text-gray-400">confessions</p>
                      </div>

                      <div className="bg-purple-50 border-2 border-dashed border-purple-300 rounded-lg p-2.5">
                        <p className="text-[10px] text-gray-500 font-bold uppercase">ETH Price</p>
                        <p className="text-xl font-black text-purple-600" data-testid="text-eth-price">
                          ${contractData.ethPrice}
                        </p>
                        <p className="text-[10px] text-gray-400">via Chainlink</p>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-dashed border-gray-300 flex flex-wrap gap-2 items-center justify-between">
                      <Badge color={isOwner ? 'bg-teal-dim' : 'bg-red-200'}>
                        {isOwner ? 'Owner' : 'Not Owner'}
                      </Badge>
                      <a
                        href={`${NETWORKS[network].explorer}/address/${CONTRACT_ADDRESS}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-cyan-600 hover:underline flex items-center gap-1 font-bold"
                      >
                        Explorer <ExternalLink size={10} />
                      </a>
                    </div>
                  </SketchCard>

                  {/* Owner Controls */}
                  {isOwner && (
                    <>
                      {/* Update Fee */}
                      <SketchCard delay={1}>
                        <h3 className="font-bold text-sm mb-3 flex items-center gap-1.5">
                          <DollarSign size={16} /> Update Fee
                        </h3>

                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {feePresets.map((preset) => (
                            <button
                              key={preset.label}
                              onClick={() => setNewFeeUsd((preset.cents / 100).toString())}
                              className={`px-3 py-1.5 border-2 border-black rounded-lg font-bold text-xs transition-all ${
                                parseFloat(newFeeUsd) === preset.cents / 100
                                  ? 'bg-black text-white shadow-sketch'
                                  : 'bg-white hover:bg-gray-50'
                              }`}
                              data-testid={`button-preset-${preset.cents}`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        <div className="space-y-2">
                          <div className="flex">
                            <span className="flex items-center px-2.5 bg-gray-100 border-2 border-r-0 border-black rounded-l-lg font-bold text-sm">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={newFeeUsd}
                              onChange={(e) => setNewFeeUsd(e.target.value)}
                              className="flex-1 min-w-0 border-2 border-black rounded-r-lg px-3 py-2 font-mono text-sm bg-paper focus:outline-none"
                              data-testid="input-fee"
                            />
                          </div>
                          <SketchButton
                            onClick={updateFee}
                            disabled={loading}
                            icon={Save}
                            className="w-full"
                            data-testid="button-update-fee"
                          >
                            {loading ? 'Updating...' : 'Update Fee'}
                          </SketchButton>
                        </div>
                      </SketchCard>

                      {/* Withdraw */}
                      <SketchCard delay={2}>
                        <h3 className="font-bold text-sm mb-3 flex items-center gap-1.5">
                          <Download size={16} /> Withdraw
                        </h3>

                        <div className="bg-teal-50 border-2 border-dashed border-teal-300 rounded-lg p-3 mb-3 text-center">
                          <p className="text-[10px] text-gray-500 uppercase font-bold">Available</p>
                          <p className="text-2xl font-black text-teal-600">${balanceUsd}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{parseFloat(contractData.balanceEth).toFixed(6)} ETH</p>
                        </div>

                        <SketchButton
                          onClick={withdrawFunds}
                          disabled={loading || contractData.balance === '0'}
                          className="w-full bg-teal"
                          icon={Download}
                          data-testid="button-withdraw"
                        >
                          {loading ? 'Processing...' : 'Withdraw All'}
                        </SketchButton>
                      </SketchCard>
                    </>
                  )}

                  {/* Not Owner Warning */}
                  {!isOwner && (
                    <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="text-yellow-600 flex-shrink-0" size={20} />
                        <div>
                          <p className="font-bold text-yellow-800 text-sm">View Only</p>
                          <p className="text-xs text-yellow-700">Connect as owner to make changes.</p>
                          <div className="mt-2 text-[10px] font-mono text-yellow-600 break-all">
                            <p>You: {walletAddress.slice(0, 10)}...{walletAddress.slice(-6)}</p>
                            <p>Owner: {contractData.owner.slice(0, 10)}...{contractData.owner.slice(-6)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Database/Moderation Tab */}
          {activeTab === 'database' && (
            <div className="space-y-4">
              <SketchCard delay={0}>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-sm flex items-center gap-1.5">
                    <Database size={16} /> Stats
                  </h3>
                  <button
                    onClick={() => loadDbData()}
                    className="p-1.5 hover:bg-gray-100 rounded-lg border-2 border-black transition-colors"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-paper border-2 border-dashed border-gray-300 rounded-lg p-2 text-center">
                    <p className="text-lg font-black">{dbStats.totalConfessions}</p>
                    <p className="text-[9px] text-gray-500">Total</p>
                  </div>
                  <div className="bg-cyan-50 border-2 border-dashed border-cyan-300 rounded-lg p-2 text-center">
                    <p className="text-lg font-black text-cyan-600">{dbStats.anchoredCount}</p>
                    <p className="text-[9px] text-gray-500">On-chain</p>
                  </div>
                  <div className="bg-pink-50 border-2 border-dashed border-pink-300 rounded-lg p-2 text-center">
                    <p className="text-lg font-black text-pink-600">{dbStats.totalVotes}</p>
                    <p className="text-[9px] text-gray-500">Votes</p>
                  </div>
                  <div className="bg-red-50 border-2 border-dashed border-red-300 rounded-lg p-2 text-center">
                    <p className="text-lg font-black text-red-600">{dbStats.hiddenCount}</p>
                    <p className="text-[9px] text-gray-500">Hidden</p>
                  </div>
                </div>
              </SketchCard>

              {/* Wallet Auth Status */}
              {!isConnected && (
                <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg mb-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="text-yellow-600 flex-shrink-0" size={18} />
                    <div>
                      <p className="font-bold text-yellow-800 text-sm">Connect Wallet</p>
                      <p className="text-xs text-yellow-700">Connect your wallet on the Contract tab first.</p>
                    </div>
                  </div>
                </div>
              )}

              {isConnected && !isOwner && (
                <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg mb-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="text-red-600 flex-shrink-0" size={18} />
                    <div>
                      <p className="font-bold text-red-800 text-sm">Not Authorized</p>
                      <p className="text-xs text-red-700">Only the contract owner can moderate content.</p>
                    </div>
                  </div>
                </div>
              )}

              {isConnected && isOwner && !adminSession && (
                <SketchCard delay={1}>
                  <h3 className="font-bold text-sm mb-3 flex items-center gap-1.5">
                    <Shield size={16} /> Admin Authentication
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Sign a message to prove you're the contract owner and unlock moderation controls.
                  </p>
                  <SketchButton
                    onClick={authenticateAsAdmin}
                    disabled={isAuthenticating}
                    icon={Shield}
                    className="w-full"
                    data-testid="button-authenticate"
                  >
                    {isAuthenticating ? 'Signing...' : 'Sign to Authenticate'}
                  </SketchButton>
                </SketchCard>
              )}

              {isConnected && isOwner && adminSession && (
                <div className="p-3 bg-green-50 border-2 border-green-300 rounded-lg mb-4 flex items-center gap-2">
                  <Check className="text-green-600 flex-shrink-0" size={16} />
                  <p className="text-xs text-green-700 font-bold">Authenticated - session active</p>
                </div>
              )}

              <SketchCard delay={1}>
                <h3 className="font-bold text-sm mb-3 flex items-center gap-1.5">
                  <Shield size={16} /> Content Moderation
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Toggle visibility to hide inappropriate confessions from public view.
                </p>

                {allConfessions.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">No confessions yet</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {allConfessions.map((c) => (
                      <div 
                        key={c.id} 
                        className={`p-3 rounded-lg border-2 transition-all ${
                          c.isHidden 
                            ? 'bg-red-50 border-red-200 opacity-60' 
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs leading-relaxed ${c.isHidden ? 'line-through text-gray-400' : ''}`}>
                              {c.displayText.slice(0, 100)}{c.displayText.length > 100 ? '...' : ''}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[9px] font-bold">
                                {c.category}
                              </span>
                              {c.isAnchored && (
                                <span className="px-1.5 py-0.5 bg-cyan-100 rounded text-[9px] font-bold text-cyan-700">
                                  On-Chain
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 bg-pink-100 rounded text-[9px] font-bold text-pink-700">
                                {c.likes} likes
                              </span>
                            </div>
                          </div>
                          {adminSession ? (
                            <button
                              onClick={() => toggleVisibility(c.id, c.isHidden || false)}
                              className={`p-2 rounded-lg border-2 transition-all flex-shrink-0 ${
                                c.isHidden
                                  ? 'bg-green-100 border-green-300 hover:bg-green-200 text-green-700'
                                  : 'bg-red-100 border-red-300 hover:bg-red-200 text-red-700'
                              }`}
                              title={c.isHidden ? 'Show confession' : 'Hide confession'}
                              data-testid={`button-toggle-${c.id}`}
                            >
                              {c.isHidden ? <Eye size={16} /> : <EyeOff size={16} />}
                            </button>
                          ) : (
                            <div className="p-2 text-gray-300">
                              <Shield size={16} />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SketchCard>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 text-center text-[10px] text-gray-400 font-mono">
            {CONTRACT_ADDRESS && (
              <p>{CONTRACT_ADDRESS.slice(0, 10)}...{CONTRACT_ADDRESS.slice(-6)}</p>
            )}
            <p className="mt-1">Auto-refresh: 30s</p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('adminAuth') === 'true';
  });

  if (!isAuthenticated) {
    return <PasswordGate onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return <AdminPanel />;
}
