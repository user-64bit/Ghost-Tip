"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Per-browser OAuth claim session, scoped to a claim token. */
interface ClaimSessionState {
  // keyed by claimToken
  sessions: Record<string, { session: string; verifiedHandle: string; at: string }>;
  set: (token: string, s: { session: string; verifiedHandle: string }) => void;
  get: (token: string) => { session: string; verifiedHandle: string } | null;
  clear: (token: string) => void;
}

export const useClaimSessionStore = create<ClaimSessionState>()(
  persist(
    (set, get) => ({
      sessions: {},
      set: (token, s) =>
        set((st) => ({
          sessions: {
            ...st.sessions,
            [token]: { ...s, at: new Date().toISOString() },
          },
        })),
      get: (token) => {
        const e = get().sessions[token];
        if (!e) return null;
        // OAuth sessions are Redis-bound to 30 min. After that, server will
        // reject even if we still have a local copy — but we trim here too.
        if (Date.now() - new Date(e.at).getTime() > 30 * 60 * 1000) return null;
        return { session: e.session, verifiedHandle: e.verifiedHandle };
      },
      clear: (token) =>
        set((st) => {
          const next = { ...st.sessions };
          delete next[token];
          return { sessions: next };
        }),
    }),
    {
      name: "ghosttip-claim-sessions",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
