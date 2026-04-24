/**
 * Runtime env validation.
 *
 * Imported by the Prisma + Redis singletons so the first server-side request
 * after boot surfaces missing / dangerous config as a loud log line (and, in
 * production, a hard throw). Without this the app would boot happily and
 * fail later with a confusing Prisma / Twitter error at request time.
 *
 * Kept dependency-free so it can run before Prisma is initialised.
 */

interface EnvCheck {
  key: string;
  /** Fatal in prod, warn in dev. */
  required: boolean;
  /** Extra guard run only when the var is present. */
  validate?: (value: string) => string | null;
  /** Human-readable note shown in failure messages. */
  hint?: string;
}

const CHECKS: EnvCheck[] = [
  {
    key: "DATABASE_URL",
    required: true,
    hint: "Postgres connection string. Run `npm run db:up` for the docker-compose default.",
  },
  {
    key: "NEXT_PUBLIC_APP_URL",
    required: true,
    hint: "Used as the base for OAuth callbacks and share links.",
    validate: (v) => (/^https?:\/\//.test(v) ? null : "must start with http(s)://"),
  },
  {
    key: "GHOSTTIP_AUTHORITY_KEYPAIR",
    // Required unless the operator has explicitly opted into mock mode.
    required: process.env.ANCHOR_ON_CHAIN_DISABLED !== "true",
    hint: "64-byte JSON array. Run `bun scripts/init-authority.ts` to generate + fund.",
    validate: (v) => {
      try {
        const arr = JSON.parse(v);
        if (!Array.isArray(arr) || arr.length !== 64)
          return "must be a 64-byte JSON array";
        return null;
      } catch {
        return "must be a JSON array of bytes";
      }
    },
  },
  {
    key: "TWITTER_CLIENT_ID",
    required: true,
    hint: "Claim flow cannot verify ownership without real X credentials.",
  },
  {
    key: "REDIS_URL",
    required: false,
    hint: "Falls back to an in-memory store for dev. NOT safe for production.",
  },
  {
    key: "CRON_SECRET",
    // Vercel-hosted deployments can rely on the x-vercel-cron header; a
    // shared secret is still the portable default.
    required: process.env.NODE_ENV === "production",
    hint: "Shared secret required to hit /api/cron/expiry from an external scheduler.",
  },
];

const DANGER_FLAGS: Array<{ key: string; badValue: string; reason: string }> = [
  {
    key: "ANCHOR_ON_CHAIN_DISABLED",
    badValue: "true",
    reason:
      "claim_tip / refund_tip will emit mock signatures instead of hitting Solana — funds stay locked in the escrow PDA.",
  },
];

export interface EnvReport {
  ok: boolean;
  problems: string[];
  warnings: string[];
}

let cached: EnvReport | null = null;

/**
 * Whether we're currently inside `next build` (page-data collection, SSG,
 * etc.). Next sets NEXT_PHASE during build; during that phase NODE_ENV is
 * already "production" but real runtime credentials aren't expected to be
 * present. Skipping validation here keeps CI / Vercel deploys unblocked.
 */
function isBuildPhase(): boolean {
  const phase = process.env.NEXT_PHASE;
  return phase === "phase-production-build" || phase === "phase-development-build";
}

/**
 * Error thrown when required env vars are missing at runtime. Carries the
 * structured report so API routes can surface a JSON response instead of
 * letting Next.js fall through to its default HTML error page.
 */
export class EnvValidationError extends Error {
  readonly report: EnvReport;
  constructor(report: EnvReport) {
    super(
      `GhostTip env validation failed: ${report.problems.join(" | ")}`
    );
    this.name = "EnvValidationError";
    this.report = report;
  }
}

export function validateEnv(): EnvReport {
  if (cached) return cached;

  const problems: string[] = [];
  const warnings: string[] = [];

  for (const check of CHECKS) {
    const value = process.env[check.key];
    if (!value) {
      const msg = `${check.key} is not set${check.hint ? ` — ${check.hint}` : ""}`;
      if (check.required) problems.push(msg);
      else warnings.push(msg);
      continue;
    }
    if (check.validate) {
      const issue = check.validate(value);
      if (issue) {
        const msg = `${check.key}: ${issue}${check.hint ? ` (${check.hint})` : ""}`;
        if (check.required) problems.push(msg);
        else warnings.push(msg);
      }
    }
  }

  const isRuntimeProduction =
    process.env.NODE_ENV === "production" && !isBuildPhase();
  for (const flag of DANGER_FLAGS) {
    if (process.env[flag.key] === flag.badValue) {
      const msg = `${flag.key}=${flag.badValue} — ${flag.reason}`;
      if (isRuntimeProduction) problems.push(msg);
      else warnings.push(msg);
    }
  }

  const report: EnvReport = {
    ok: problems.length === 0,
    problems,
    warnings,
  };
  cached = report;

  if (problems.length) {
    const banner = [
      "",
      "─────────────────────── GhostTip env validation ───────────────────────",
      ...problems.map((p) => `  ✗ ${p}`),
      ...warnings.map((w) => `  ! ${w}`),
      "───────────────────────────────────────────────────────────────────────",
      "",
    ].join("\n");
    console.error(banner);
  } else if (warnings.length) {
    console.warn(
      `[env] ${warnings.length} non-fatal warning(s):\n${warnings
        .map((w) => `  ! ${w}`)
        .join("\n")}`
    );
  }

  return report;
}

/**
 * Runtime guard for API routes. Unlike the previous module-import throw,
 * this one is called lazily from the `handler` wrapper so failures surface
 * through our JSON error envelope — not as a Next.js default HTML 500.
 */
export function assertEnvOrThrow(): void {
  if (isBuildPhase()) return;
  if (process.env.NODE_ENV !== "production") {
    validateEnv();
    return;
  }
  const report = validateEnv();
  if (!report.ok) {
    throw new EnvValidationError(report);
  }
}

// Soft warm-up at import — logs problems but doesn't throw, so the route
// handler stays reachable and can return a structured error via
// `assertEnvOrThrow()` + the api.ts handler wrapper.
if (!isBuildPhase()) {
  validateEnv();
}
