import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import CryptoConfessions from "@/pages/Home";
import AdminPage from "@/pages/Admin";

import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './lib/wagmiConfig';
import sdk from '@farcaster/frame-sdk';

function Router() {
  return (
    <Switch>
      <Route path="/" component={CryptoConfessions} />
      <Route path="/admin" component={AdminPage} />
      <Route component={CryptoConfessions} />
    </Switch>
  );
}

function FrameReadyProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const initFrame = async () => {
      try {
        await sdk.actions.ready();
        console.log('Frame SDK ready');
      } catch (e) {
        console.log('Not running in a Farcaster frame context');
      }
    };
    initFrame();
  }, []);

  return <>{children}</>;
}

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <FrameReadyProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </FrameReadyProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
