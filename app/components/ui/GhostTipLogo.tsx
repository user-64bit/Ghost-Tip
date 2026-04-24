/**
 * GhostTip wordmark + glyph.
 *
 * The glyph: a half-silhouette ghost whose tail forms a subtle Solana-arrow
 * diagonal. Kept abstract, monochrome, and sized in em so it tracks type.
 */

export function GhostTipGlyph({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="gtg" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#B6A9FF" />
          <stop offset="0.55" stopColor="#7C6AF7" />
          <stop offset="1" stopColor="#4ECDC4" />
        </linearGradient>
      </defs>
      {/* Ghost silhouette */}
      <path
        d="M16 3c-5.3 0-9.5 4-9.5 9.4v12.1c0 1.8 2.1 2.8 3.5 1.7l1.9-1.4c.5-.4 1.2-.4 1.7 0l1.9 1.4c.5.4 1.2.4 1.7 0l1.9-1.4c.5-.4 1.2-.4 1.7 0l1.9 1.4c1.4 1.1 3.5.1 3.5-1.7V12.4C25.5 7 21.3 3 16 3Z"
        fill="url(#gtg)"
      />
      {/* Eyes */}
      <circle cx="12.3" cy="13.4" r="1.35" fill="#0A0A0F" />
      <circle cx="19.7" cy="13.4" r="1.35" fill="#0A0A0F" />
      {/* Transaction arrow traced through the ghost belly */}
      <path
        d="M9.8 18.6 H21.4 M18.9 16 l2.5 2.6 -2.5 2.6"
        stroke="#0A0A0F"
        strokeOpacity="0.55"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GhostTipLogo({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <GhostTipGlyph size={size} />
      <span
        className="font-display text-[1.1em] font-bold tracking-tight text-foreground"
        style={{ lineHeight: 1 }}
      >
        GhostTip
      </span>
    </div>
  );
}
