"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { ClusterMoniker } from "../lib/solana-client";
import { CLUSTERS } from "../lib/solana-client";
import { getExplorerUrl } from "../lib/explorer";

type ClusterContextValue = {
  cluster: ClusterMoniker;
  setCluster: (cluster: ClusterMoniker) => void;
  getExplorerUrl: (path: string) => string;
};

const ClusterContext = createContext<ClusterContextValue | null>(null);

const STORAGE_KEY = "ghosttip-cluster";

function defaultCluster(): ClusterMoniker {
  const env = process.env.NEXT_PUBLIC_SOLANA_NETWORK as
    | ClusterMoniker
    | undefined;
  if (env && CLUSTERS.includes(env)) return env;
  return "devnet";
}

export { CLUSTERS };

export function ClusterProvider({ children }: { children: ReactNode }) {
  // Start from the env-derived default on both server and first client
  // render so the initial markup matches. localStorage is only read after
  // mount (below) — otherwise server HTML would embed `defaultCluster()`
  // while the client rehydrates with whatever the user last picked, and
  // React would flag a hydration mismatch.
  const [cluster, setClusterState] = useState<ClusterMoniker>(defaultCluster);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && CLUSTERS.includes(stored as ClusterMoniker)) {
      setClusterState(stored as ClusterMoniker);
    }
  }, []);

  const setCluster = useCallback((c: ClusterMoniker) => {
    setClusterState(c);
    localStorage.setItem(STORAGE_KEY, c);
  }, []);

  const explorerUrl = useCallback(
    (path: string) => getExplorerUrl(path, cluster),
    [cluster]
  );

  return (
    <ClusterContext.Provider
      value={{ cluster, setCluster, getExplorerUrl: explorerUrl }}
    >
      {children}
    </ClusterContext.Provider>
  );
}

export function useCluster() {
  const ctx = useContext(ClusterContext);
  if (!ctx) throw new Error("useCluster must be used within ClusterProvider");
  return ctx;
}
