"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Cluster, CreateTipResponse, TipMode, TipRail } from "../types/tip";

/**
 * Tip state persisted in the browser so the sender doesn't lose their claim
 * link if they refresh. Keyed by tipIntentId; we keep the last 20.
 */

export interface StoredTip {
  tipIntentId: string;
  cluster: Cluster;
  mode: TipMode;
  rail: TipRail | null;
  /** Only populated for ESCROW_CLAIM tips. */
  claimLink?: string;
  claimToken?: string;
  recipientHandle: string;
  recipientHandleType: "x" | "telegram" | "ghosttip";
  recipientWallet?: string;
  amount: string;
  tokenSymbol: string;
  expiryAt: string;
  escrowPda?: string;
  createdAt: string;
  txSignature?: string;
  status?: string;
}

interface TipStore {
  tips: StoredTip[];
  lastTipId: string | null;
  addTip: (t: StoredTip) => void;
  updateTip: (id: string, patch: Partial<StoredTip>) => void;
  setLastTipId: (id: string | null) => void;
  getTip: (id: string) => StoredTip | undefined;
  clear: () => void;
}

export const useTipStore = create<TipStore>()(
  persist(
    (set, get) => ({
      tips: [],
      lastTipId: null,
      addTip: (t) =>
        set((s) => ({
          tips: [t, ...s.tips.filter((x) => x.tipIntentId !== t.tipIntentId)].slice(
            0,
            20
          ),
          lastTipId: t.tipIntentId,
        })),
      updateTip: (id, patch) =>
        set((s) => ({
          tips: s.tips.map((t) =>
            t.tipIntentId === id ? { ...t, ...patch } : t
          ),
        })),
      setLastTipId: (id) => set({ lastTipId: id }),
      getTip: (id) => get().tips.find((t) => t.tipIntentId === id),
      clear: () => set({ tips: [], lastTipId: null }),
    }),
    {
      name: "ghosttip-tip-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ tips: s.tips, lastTipId: s.lastTipId }),
    }
  )
);

export function mapCreateResponseToStored(
  res: CreateTipResponse,
  extra: {
    recipientHandle: string;
    recipientHandleType: StoredTip["recipientHandleType"];
  }
): StoredTip {
  if (res.mode === "ESCROW_CLAIM") {
    return {
      tipIntentId: res.tipIntentId,
      cluster: res.cluster,
      mode: res.mode,
      rail: null,
      claimLink: res.claimLink,
      claimToken: res.claimToken,
      recipientHandle: extra.recipientHandle,
      recipientHandleType: extra.recipientHandleType,
      amount: res.amount,
      tokenSymbol: res.tokenSymbol,
      expiryAt: res.expiryAt,
      escrowPda: res.escrowPda,
      createdAt: new Date().toISOString(),
    };
  }
  return {
    tipIntentId: res.tipIntentId,
    cluster: res.cluster,
    mode: res.mode,
    rail: res.rail,
    recipientHandle: extra.recipientHandle,
    recipientHandleType: extra.recipientHandleType,
    recipientWallet: res.recipientWallet,
    amount: res.amount,
    tokenSymbol: res.tokenSymbol,
    expiryAt: res.expiryAt,
    createdAt: new Date().toISOString(),
  };
}
