import { ImageResponse } from "next/og";

/**
 * Claim-page OG card. Intentionally generic — we don't look up the claim
 * token (and therefore the amount / intended handle) in the DB here
 * because:
 *   1. The claim token is sensitive; social link-unfurlers cache whatever
 *      we return, so leaking per-tip details into those caches is bad.
 *   2. Hitting Prisma from edge runtime adds cold-start latency to a
 *      surface that's rendered tens of times per share.
 *
 * The generic "A tip is waiting" card is enough to make the share preview
 * feel intentional without compromising the privacy model.
 */

export const runtime = "edge";
export const alt = "Someone tipped you on GhostTip";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ClaimOpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 50% 10%, rgba(124,106,247,0.4), transparent 45%), radial-gradient(circle at 80% 100%, rgba(78,205,196,0.25), transparent 55%), #0A0A0F",
          color: "#F0F0F8",
          padding: "96px 80px",
          position: "relative",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        {/* Brand */}
        <div
          style={{
            position: "absolute",
            top: 48,
            left: 56,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <GhostGlyph size={42} />
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              display: "flex",
            }}
          >
            GhostTip
          </div>
        </div>

        {/* Ghost badge + glow */}
        <div
          style={{
            width: 180,
            height: 180,
            borderRadius: 999,
            background: "rgba(124,106,247,0.14)",
            border: "1px solid rgba(124,106,247,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 0 18px rgba(124,106,247,0.06)",
            marginBottom: 32,
          }}
        >
          <GhostGlyph size={96} />
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 26,
            color: "#8F8FB5",
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          Someone tipped you
        </div>

        <div
          style={{
            fontSize: 104,
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
            marginTop: 14,
            backgroundImage: "linear-gradient(90deg, #B6A9FF, #7C6AF7, #4ECDC4)",
            backgroundClip: "text",
            color: "transparent",
            display: "flex",
          }}
        >
          Claim your tip.
        </div>

        <div
          style={{
            fontSize: 28,
            color: "#8F8FB5",
            marginTop: 28,
            textAlign: "center",
            maxWidth: 880,
            lineHeight: 1.35,
            display: "flex",
          }}
        >
          Verify with X to prove this tip is for you — then connect a wallet
          to receive it. Expires if unclaimed.
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 44,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 24,
            fontSize: 18,
            color: "#6B6B8A",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
          }}
        >
          <span>private · solana · loyal rail</span>
        </div>
      </div>
    ),
    { ...size }
  );
}

function GhostGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="gtg"
          x1="4"
          y1="2"
          x2="28"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#B6A9FF" />
          <stop offset="0.55" stopColor="#7C6AF7" />
          <stop offset="1" stopColor="#4ECDC4" />
        </linearGradient>
      </defs>
      <path
        d="M16 3c-5.3 0-9.5 4-9.5 9.4v12.1c0 1.8 2.1 2.8 3.5 1.7l1.9-1.4c.5-.4 1.2-.4 1.7 0l1.9 1.4c.5.4 1.2.4 1.7 0l1.9-1.4c.5-.4 1.2-.4 1.7 0l1.9 1.4c1.4 1.1 3.5.1 3.5-1.7V12.4C25.5 7 21.3 3 16 3Z"
        fill="url(#gtg)"
      />
      <circle cx="12.3" cy="13.4" r="1.35" fill="#0A0A0F" />
      <circle cx="19.7" cy="13.4" r="1.35" fill="#0A0A0F" />
    </svg>
  );
}
