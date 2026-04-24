import { ImageResponse } from "next/og";

/**
 * Root Open Graph card — what shows up when the site is pasted into X,
 * Discord, iMessage, Slack, etc. Rendered at request time via Satori
 * (next/og), so the image stays in sync with brand colors without a
 * Figma round-trip.
 *
 * Size is the X / Meta consensus: 1200x630 fits the large-image card
 * across every major link unfurler.
 */

export const runtime = "edge";
export const alt = "GhostTip — Tip anyone. Stay ghost.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
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
            "radial-gradient(circle at 25% 15%, rgba(124,106,247,0.38), transparent 45%), radial-gradient(circle at 85% 85%, rgba(78,205,196,0.18), transparent 50%), #0A0A0F",
          color: "#F0F0F8",
          padding: "96px 80px",
          position: "relative",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        {/* Top-left brand lockup */}
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

        {/* Status pill — echoes the on-site hero */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 18px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.03)",
            color: "#A8A8C8",
            fontSize: 18,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            marginBottom: 36,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#4ECDC4",
            }}
          />
          private tips · solana · loyal rail
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 112,
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 1.02,
            display: "flex",
          }}
        >
          Tip anyone.
        </div>
        <div
          style={{
            fontSize: 112,
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 1.02,
            backgroundImage: "linear-gradient(90deg, #B6A9FF, #7C6AF7, #4ECDC4)",
            backgroundClip: "text",
            color: "transparent",
            display: "flex",
          }}
        >
          Stay ghost.
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: "#8F8FB5",
            marginTop: 36,
            textAlign: "center",
            maxWidth: 920,
            lineHeight: 1.35,
            display: "flex",
          }}
        >
          Send SOL by X handle. Recipient verifies with X to claim. Funds
          auto-refund if unclaimed.
        </div>

        {/* Footer chips */}
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
          <span>ghost-tip.vercel.app</span>
        </div>
      </div>
    ),
    { ...size }
  );
}

/**
 * Inlined ghost glyph — matches app/components/ui/GhostTipLogo.tsx. Kept
 * in-file because Satori doesn't resolve React components from outside
 * the edge function's module graph cleanly.
 */
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
