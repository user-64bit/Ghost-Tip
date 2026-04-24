# GhostTip

> Privacy-first social tipping on Solana. Tip anyone by X handle — their claim
> is gated by X OAuth, settled through Loyal Network's private rail, and
> auto-refunded if unclaimed. Built for the Loyal Hackathon.

See [`GhostTip_Full_Spec.md`](./GhostTip_Full_Spec.md) for the complete
product / architecture / security spec.

---

## Quickstart

```bash
# 1. install
bun install           # runs `prisma generate` automatically

# 2. env
cp .env.example .env.local
# demo-friendly defaults are already set; only DATABASE_URL / REDIS_URL
# need to match where you actually run Postgres + Redis.

# 3. start Postgres + Redis in Docker (see docker-compose.yml)
bun run db:up         # Postgres on :5433, Redis on :6380

# 4. apply schema
bun run db:migrate

# 5. dev server
bun dev               # http://localhost:3000
```

**DB helper scripts** (all defined in `package.json`):

| Script | What it does |
|---|---|
| `bun run db:up` | start the docker-compose stack |
| `bun run db:down` | stop it (keeps data volumes) |
| `bun run db:reset` | wipe volumes and restart |
| `bun run db:logs` | tail Postgres + Redis logs |
| `bun run db:migrate` | `prisma migrate dev` |
| `bun run db:studio` | Prisma Studio on :5555 |

Ports are shifted by +1 (5433 / 6380) so the stack coexists with a native
Postgres.app / Homebrew Postgres / local Redis on default ports.

### Demo mode (no Twitter, no deployed program)

`.env.example` ships with the following demo-friendly defaults so judges can
run the full flow without secrets:

| Var | Value | Effect |
|---|---|---|
| `NEXT_PUBLIC_OAUTH_BYPASS` | `true` | Verify step trusts the intended handle — skip real X OAuth. |
| `NEXT_PUBLIC_LOYAL_MOCK` | `true` | Loyal calls return a mocked private-rail settlement. |
| `ANCHOR_ON_CHAIN_DISABLED` | `true` | Backend `claim_tip` / `refund_tip` use mock tx signatures. |

Flip these to `false` once you've wired real keys / deployed the program.

### Real mode (full stack)

1. **Program**
   ```bash
   cd anchor && anchor build && anchor deploy
   # update NEXT_PUBLIC_PROGRAM_ID with the deployed address (also in Anchor.toml)
   ```

2. **Env**
   - `GHOSTTIP_AUTHORITY_KEYPAIR` — paste the JSON array output of
     `cat authority.json`. Must be the same key used when initialising the
     program's `AuthorityConfig` PDA via `init_authority`.
   - `TWITTER_CLIENT_ID` + `TWITTER_CLIENT_SECRET` — from the X developer
     portal. Callback URL: `http://localhost:3000/api/auth/x/callback`.
   - `NEXT_PUBLIC_OAUTH_BYPASS=false`, `ANCHOR_ON_CHAIN_DISABLED=false`.

3. **Cron**
   - `bun run jobs/expiry.ts` (one-shot)
   - or `GET /api/cron/expiry` with header `x-cron-secret: $CRON_SECRET`
   - or Vercel Cron on `/api/cron/expiry` (Vercel injects `x-vercel-cron: 1`,
     no secret needed).

---

## Architecture at a glance

```
Frontend  (Next.js 16 · App Router · @solana/kit · Framer Motion)
  ├─ /                ← send flow (wallet + handle + amount)
  ├─ /claim/[token]   ← claim flow (OAuth gate + wallet + claim)
  ├─ /tip/[id]        ← sender-facing status + cancel
  └─ /profile         ← sender history

Backend  (Next.js API routes, node runtime)
  ├─ /api/tips              POST create
  ├─ /api/tips/history      GET  list by sender
  ├─ /api/tips/[id]         GET  status
  ├─ /api/tips/[id]/submit  POST confirm deposit tx
  ├─ /api/tips/[id]/cancel  POST sender cancel
  ├─ /api/claim/[token]     GET  preview
  ├─ /api/claim/[token]/verify   POST check OAuth session
  ├─ /api/claim/[token]/execute  POST wallet-signed claim
  ├─ /api/auth/x/start      GET  begin OAuth (PKCE)
  ├─ /api/auth/x/callback   GET  OAuth return
  └─ /api/cron/expiry       GET  refund expired tips

On-chain  (Anchor · programs/ghosttip)
  ├─ deposit_tip   (sender signs)
  ├─ claim_tip     (backend authority signs — gated by X OAuth off-chain)
  ├─ refund_tip    (backend authority signs — gated by Clock)
  └─ cancel_tip    (original sender signs)

State     (Postgres via Prisma: TipIntent, ClaimLink, IdentityMap, AuditEvent)
Cache     (Redis: claim_token → tipId, oauth_state, claim_session)
Settlement (Loyal Network — mock by default, swap the SDK in `app/lib/loyal.ts`)
```

## Security invariants

- Claim tokens never leave the URL — only SHA-256 hashes hit the DB.
- `claim_tip` requires the backend authority keypair on-chain, so the OAuth
  gate is enforced at the program boundary.
- `refund_tip` additionally checks
  `Clock::get().unix_timestamp >= escrow.expiry_at` on-chain.
- Claim execution requires a wallet signature over
  `ghosttip-claim:${tipId}:${token}:${wallet}` — prevents claim hijacking
  via a leaked OAuth session.
- Double claim is blocked by an atomic `updateMany` on ClaimLink plus the
  on-chain status check inside `claim_tip`.

---

## File layout

```
anchor/programs/ghosttip/   # Anchor program
prisma/schema.prisma        # Postgres schema
app/
  page.tsx                  # send
  claim/[token]/page.tsx
  tip/[id]/page.tsx
  profile/page.tsx
  api/...                   # route handlers (see above)
  components/
    layout/                 # Header, PageWrapper, Footer
    ui/                     # Button, Input, Card, Badge, Countdown, Copy…
    tip/                    # TipForm, TipStatusCard
    claim/                  # ClaimFlow (3-step gate)
  lib/
    loyal.ts                # Loyal SDK wrapper (mock fallback)
    anchor-client.ts        # browser-side instruction builders
    server/
      anchor.ts             # PDAs, instruction builders, on-chain submit
      authority.ts          # backend authority signer (keypair loader)
      crypto.ts             # claim tokens, tip ids, PKCE
      identity.ts           # handle normalisation, IdentityMap, audit
      prisma.ts             # Prisma singleton
      redis.ts              # ioredis singleton (+ in-memory fallback)
      api.ts                # { ok, fail, serialise } envelope helpers
      verify-signature.ts   # ed25519 wallet signature check
  store/
    tipStore.ts             # zustand (persisted) — sender's last tips
    sessionStore.ts         # zustand (session) — OAuth claim sessions
  types/tip.ts              # shared types + error codes
jobs/expiry.ts              # cron entrypoint + runExpiryJob()
```

---

## Hackathon demo script

See `GhostTip_Full_Spec.md §20` for the judge-facing walkthrough. TL;DR:

1. Browser A — connect wallet, tip `@targethandle` 0.1 SOL with a short
   expiry.
2. Confirmation screen shows claim link + live countdown.
3. Browser B (incognito) — open the claim link.
4. Verify with X (bypass in demo mode, real OAuth otherwise).
5. Connect wallet → Claim → success animation + tx signature.
6. Browser A flips to `CLAIMED` live via SWR polling.
7. Bonus: second tip with 60-second expiry → wait → cron → `REFUNDED`.
