"use client";

import { Toaster } from "sonner";
import { PropsWithChildren } from "react";
import { ClusterProvider } from "./cluster-context";
import { WalletProvider } from "../lib/wallet/context";
import { SolanaClientProvider } from "../lib/solana-client-context";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ClusterProvider>
      <SolanaClientProvider>
        <WalletProvider>{children}</WalletProvider>
      </SolanaClientProvider>
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "#111118",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#F0F0F8",
          },
        }}
      />
    </ClusterProvider>
  );
}
