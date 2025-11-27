import { http, createConfig, fallback } from 'wagmi';
import { base } from 'wagmi/chains';
import { farcasterMiniApp as miniAppConnector } from '@farcaster/miniapp-wagmi-connector';
import { injected, coinbaseWallet } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: fallback([
      http('https://base-mainnet.g.alchemy.com/v2/demo'),
      http('https://1rpc.io/base'),
      http('https://base.meowrpc.com'),
      http(),
    ]),
  },
  connectors: [
    miniAppConnector(),
    injected({ shimDisconnect: true }),
    coinbaseWallet({ appName: 'Crypto Confessions' }),
  ],
});
