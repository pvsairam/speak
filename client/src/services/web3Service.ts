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

const RPC_URLS: Record<number, string[]> = {
  [base.id]: [
    'https://base-mainnet.g.alchemy.com/v2/demo',
    'https://1rpc.io/base',
    'https://base.llamarpc.com',
    'https://mainnet.base.org',
  ],
  [sepolia.id]: [
    'https://rpc.sepolia.org',
    'https://sepolia.drpc.org',
    'https://ethereum-sepolia-rpc.publicnode.com',
  ],
};

const getPublicClient = async () => {
  const chain = getActiveChain();
  const rpcUrls = RPC_URLS[chain.id] || [chain.rpcUrls.default.http[0]];
  
  for (const rpcUrl of rpcUrls) {
    try {
      const client = createPublicClient({
        chain,
        transport: http(rpcUrl)
      });
      await client.getBlockNumber();
      return client;
    } catch (e) {
      continue;
    }
  }
  
  return createPublicClient({
    chain,
    transport: http(rpcUrls[0])
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
  const DEFAULT_FEE = { feeWei: BigInt(400000000000000), feeUsd: 1.00, ethPrice: 2500 };
  
  if (!isAnchoringEnabled()) {
    return { feeWei: BigInt(0), feeUsd: 0, ethPrice: 0 };
  }

  try {
    const publicClient = await getPublicClient();
    
    let feeWei: bigint = DEFAULT_FEE.feeWei;
    let feeUsdCents: number = 100;
    let ethPriceRaw: number = 250000000000;

    try {
      const result = await publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: ABI,
        functionName: 'getFeeInWei',
      });
      feeWei = result as bigint;
    } catch {
      try {
        const result = await publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: ABI,
          functionName: 'confessionFee',
        });
        feeWei = result as bigint;
      } catch {
        console.log('Using default fee: contract fee functions not available');
      }
    }

    try {
      const result = await publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: ABI,
        functionName: 'feeUsdCents',
      });
      feeUsdCents = Number(result);
    } catch {
      console.log('Using default USD fee');
    }

    try {
      const result = await publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: ABI,
        functionName: 'getEthPrice',
      });
      ethPriceRaw = Number(result);
    } catch {
      console.log('Using default ETH price');
    }

    return {
      feeWei,
      feeUsd: feeUsdCents / 100,
      ethPrice: ethPriceRaw / 1e8,
    };
  } catch (error) {
    console.log("Using default contract fee");
    return DEFAULT_FEE;
  }
};

export const getConfessionFeeDisplay = async (): Promise<string> => {
  const { feeUsd } = await getContractFee();
  return `$${feeUsd.toFixed(2)}`;
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
    const { feeWei } = await getContractFee();
    
    console.log('Confession fee from contract:', feeWei.toString(), 'wei');
    console.log('Fee in ETH:', Number(feeWei) / 1e18);

    // Create a keccak256 hash of the confession text
    const hash = keccak256(toHex(confessionText));
    console.log('Confession hash:', hash);

    const data = encodeFunctionData({
      abi: ABI,
      functionName: 'storeConfessionHash',
      args: [hash]
    });

    console.log('Sending transaction to contract:', CONTRACT_ADDRESS);
    console.log('Value:', feeWei.toString(), 'wei');

    const hashTx = await walletClient.sendTransaction({
      account,
      to: CONTRACT_ADDRESS as `0x${string}`,
      data: data,
      value: feeWei,
      chain
    });

    console.log('Transaction hash:', hashTx);
    return hashTx;

  } catch (error: any) {
    console.error("Transaction failed:", error);
    
    // Provide more helpful error messages
    if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient ETH balance. You need at least $1.05 worth of ETH on Base.');
    }
    if (error.message?.includes('user rejected') || error.message?.includes('User denied')) {
      throw new Error('Transaction was cancelled.');
    }
    if (error.message?.includes('Internal JSON-RPC error')) {
      throw new Error('Transaction would fail. The contract may require exact fee or the hash may already exist.');
    }
    throw error;
  }
};
