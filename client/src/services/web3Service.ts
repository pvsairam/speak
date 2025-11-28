import { createWalletClient, createPublicClient, custom, http, encodeFunctionData, keccak256, toHex } from 'viem';
import { base, sepolia } from 'viem/chains';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';
const NETWORK = import.meta.env.VITE_NETWORK || 'sepolia';

export const getActiveChain = () => {
  return NETWORK === 'base' ? base : sepolia;
};

export const getChainId = () => {
  return NETWORK === 'base' ? base.id : sepolia.id;
};

const ABI = [
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
  {
    inputs: [],
    name: "confessionFee",
    outputs: [{ type: "uint256" }],
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
  }
];

const getProvider = () => {
  if (typeof window !== 'undefined' && window.ethereum) {
    if (window.ethereum.providers?.length) {
      return window.ethereum.providers[0];
    }
    return window.ethereum;
  }
  return null;
};

// Fast RPC endpoint - use the official Base RPC directly
const FAST_RPC: Record<number, string> = {
  [base.id]: 'https://mainnet.base.org',
  [sepolia.id]: 'https://rpc.sepolia.org',
};

// Cached fee data with 5 minute expiry
let cachedFee: { feeWei: bigint; feeUsd: number; ethPrice: number; timestamp: number } | null = null;
const FEE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getPublicClient = () => {
  const chain = getActiveChain();
  
  // Create client with fast RPC - no caching to avoid stale client issues
  return createPublicClient({
    chain,
    transport: http(FAST_RPC[chain.id] || chain.rpcUrls.default.http[0], {
      timeout: 10000,
    })
  });
};

export const connectWallet = async (): Promise<string | null> => {
  const provider = getProvider();

  if (!provider) {
    throw new Error("No crypto wallet found. Please install a wallet or use a Web3 browser.");
  }

  try {
    const chain = getActiveChain();
    const client = createWalletClient({
      chain,
      transport: custom(provider)
    });

    const [address] = await client.requestAddresses();
    return address;
  } catch (error) {
    console.error("Connection failed:", error);
    throw error;
  }
};

export const isAnchoringEnabled = (): boolean => {
  return CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';
};

export const hasWalletProvider = (): boolean => {
  return getProvider() !== null;
};

export const switchToCorrectNetwork = async (): Promise<void> => {
  const provider = getProvider();
  if (!provider) {
    throw new Error("No wallet provider found");
  }

  const chain = getActiveChain();
  const chainIdHex = `0x${chain.id.toString(16)}`;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
  } catch (switchError: any) {
    // Chain not added to wallet, add it
    if (switchError.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: chainIdHex,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [chain.rpcUrls.default.http[0]],
          blockExplorerUrls: [chain.blockExplorers?.default.url],
        }],
      });
    } else {
      throw switchError;
    }
  }
};

export const getContractFee = async (): Promise<{ feeWei: bigint; feeUsd: number; ethPrice: number }> => {
  // Default fallback for ~$1 at $3000 ETH
  const DEFAULT_FEE = { feeWei: BigInt(330000000000000), feeUsd: 1.00, ethPrice: 3000 };
  
  if (!isAnchoringEnabled()) {
    return { feeWei: BigInt(0), feeUsd: 0, ethPrice: 0 };
  }

  // Return cached fee if still valid
  if (cachedFee && (Date.now() - cachedFee.timestamp) < FEE_CACHE_TTL) {
    console.log('Using cached fee:', cachedFee.feeWei.toString(), 'wei');
    return { feeWei: cachedFee.feeWei, feeUsd: cachedFee.feeUsd, ethPrice: cachedFee.ethPrice };
  }

  try {
    const publicClient = getPublicClient();
    
    let feeWei: bigint = DEFAULT_FEE.feeWei;
    let feeUsdCents: number = 100;
    let ethPriceRaw: number = 300000000000; // $3000 with 8 decimals

    // Fetch all data in parallel for speed
    const [feeResult, centsResult, priceResult] = await Promise.allSettled([
      publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: ABI,
        functionName: 'getFeeInWei',
      }),
      publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: ABI,
        functionName: 'feeUsdCents',
      }),
      publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: ABI,
        functionName: 'getEthPrice',
      }),
    ]);

    if (feeResult.status === 'fulfilled') {
      feeWei = feeResult.value as bigint;
    }
    if (centsResult.status === 'fulfilled') {
      feeUsdCents = Number(centsResult.value);
    }
    if (priceResult.status === 'fulfilled') {
      ethPriceRaw = Number(priceResult.value);
    }

    const result = {
      feeWei,
      feeUsd: feeUsdCents / 100,
      ethPrice: ethPriceRaw / 1e8,
    };

    // Cache the result
    cachedFee = { ...result, timestamp: Date.now() };

    console.log('Contract fee fetched:', {
      feeWei: feeWei.toString(),
      feeEth: Number(feeWei) / 1e18,
      feeUsd: result.feeUsd,
      ethPrice: result.ethPrice,
    });

    return result;
  } catch (error) {
    console.log("Using default contract fee due to error:", error);
    return DEFAULT_FEE;
  }
};

export const getConfessionFeeDisplay = async (): Promise<string> => {
  const { feeUsd } = await getContractFee();
  return `$${feeUsd.toFixed(2)}`;
};

// Get actual USD value based on fee and ETH price
export const getActualFeeUsd = async (): Promise<number> => {
  const { feeWei, ethPrice } = await getContractFee();
  const feeEth = Number(feeWei) / 1e18;
  return feeEth * ethPrice;
};

export const anchorOnChain = async (confessionText: string): Promise<string> => {
  if (!isAnchoringEnabled()) {
    throw new Error("On-chain anchoring is not configured.");
  }
  
  const provider = getProvider();

  if (!provider) {
    throw new Error("No wallet provider found. Please connect your wallet.");
  }

  try {
    // Switch to correct network first
    await switchToCorrectNetwork();
    
    const chain = getActiveChain();
    const walletClient = createWalletClient({
      chain,
      transport: custom(provider)
    });

    const [account] = await walletClient.requestAddresses();

    // Get exact fee from contract
    const { feeWei, ethPrice } = await getContractFee();
    const feeEth = Number(feeWei) / 1e18;
    const actualUsd = feeEth * ethPrice;
    
    console.log('Transaction details:', {
      feeWei: feeWei.toString(),
      feeEth: feeEth.toFixed(6),
      ethPrice: `$${ethPrice.toFixed(2)}`,
      actualUsd: `$${actualUsd.toFixed(2)}`,
    });

    // Warn if fee seems too high (contract bug detection)
    if (actualUsd > 10) {
      console.warn(`WARNING: Fee appears too high ($${actualUsd.toFixed(2)}). Contract may need setFee(1) to be called.`);
      throw new Error(`Fee is $${actualUsd.toFixed(2)} (expected ~$1). The contract owner needs to call setFee(1) to fix this.`);
    }

    // Create a keccak256 hash of the confession text
    const hash = keccak256(toHex(confessionText));
    console.log('Confession hash:', hash);

    const data = encodeFunctionData({
      abi: ABI,
      functionName: 'storeConfessionHash',
      args: [hash]
    });

    console.log('Sending transaction...');

    const hashTx = await walletClient.sendTransaction({
      account,
      to: CONTRACT_ADDRESS as `0x${string}`,
      data: data,
      value: feeWei,
      chain
    });

    console.log('Transaction hash:', hashTx);
    
    // Clear cached fee after successful transaction
    cachedFee = null;
    
    return hashTx;

  } catch (error: any) {
    console.error("Transaction failed:", error);
    
    // Provide more helpful error messages
    if (error.message?.includes('insufficient funds')) {
      const { feeWei, ethPrice } = await getContractFee();
      const actualUsd = (Number(feeWei) / 1e18) * ethPrice;
      throw new Error(`Insufficient ETH balance. You need at least $${actualUsd.toFixed(2)} worth of ETH on Base.`);
    }
    if (error.message?.includes('user rejected') || error.message?.includes('User denied')) {
      throw new Error('Transaction was cancelled.');
    }
    if (error.message?.includes('Insufficient fee')) {
      throw new Error('The transaction requires a higher fee. Please ensure you have enough ETH.');
    }
    if (error.message?.includes('setFee(1)')) {
      throw error; // Re-throw our custom error
    }
    throw error;
  }
};
