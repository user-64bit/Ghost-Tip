import type { HTMLAttributes, ReactNode } from "react";
import type { TipStatus } from "../../types/tip";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "accent"
  | "warning"
  | "danger"
  | "muted"
  | "refunded"
  | "cancelled"
  | "draft";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  withDot?: boolean;
}

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-raised text-foreground border-border",
  primary:
    "bg-[rgba(124,106,247,0.12)] text-[#B6A9FF] border-[rgba(124,106,247,0.35)]",
  accent:
    "bg-[rgba(78,205,196,0.12)] text-[#7BE3DB] border-[rgba(78,205,196,0.35)]",
  warning:
    "bg-[rgba(244,185,66,0.12)] text-[#F4B942] border-[rgba(244,185,66,0.35)]",
  danger:
    "bg-[rgba(255,107,107,0.12)] text-[#FF8E8E] border-[rgba(255,107,107,0.35)]",
  muted: "bg-surface-raised text-muted border-border",
  // Refunded: sender got their money back — warm grey-green so the row
  // reads as "ended on good terms" without stealing attention from live tips.
  refunded:
    "bg-[rgba(120,180,160,0.08)] text-[#A8D4C4] border-[rgba(120,180,160,0.28)]",
  // Cancelled: sender bailed — rose-dust so it reads distinctly from muted
  // expired without blaring like an error.
  cancelled:
    "bg-[rgba(220,130,150,0.08)] text-[#E4AAB6] border-[rgba(220,130,150,0.28)]",
  // Draft: in-flight, not yet on-chain — cool indigo with dashed border
  // implied by the alpha.
  draft:
    "bg-[rgba(120,120,180,0.08)] text-[#A8A8C8] border-[rgba(120,120,180,0.22)]",
};

const DOT_COLORS: Record<BadgeTone, string> = {
  neutral: "#6B6B8A",
  primary: "#B6A9FF",
  accent: "#7BE3DB",
  warning: "#F4B942",
  danger: "#FF8E8E",
  muted: "#6B6B8A",
  refunded: "#A8D4C4",
  cancelled: "#E4AAB6",
  draft: "#A8A8C8",
};

export function Badge({
  tone = "neutral",
  withDot = false,
  className = "",
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em]",
        tones[tone],
        className,
      ].join(" ")}
      {...rest}
    >
      {withDot && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: DOT_COLORS[tone] }}
        />
      )}
      {children}
    </span>
  );
}

export function statusBadgeTone(status: TipStatus): BadgeTone {
  switch (status) {
    case "DRAFT":
      return "draft";
    case "PENDING":
      return "warning";
    case "CLAIMABLE":
      return "primary";
    case "CLAIMED":
      return "accent";
    case "EXPIRED":
      return "muted";
    case "REFUNDED":
      return "refunded";
    case "CANCELLED":
      return "cancelled";
    case "FAILED":
      return "danger";
  }
}

export function statusBadgeLabel(status: TipStatus): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "PENDING":
      return "Pending";
    case "CLAIMABLE":
      return "Claimable";
    case "CLAIMED":
      return "Claimed";
    case "EXPIRED":
      return "Expired";
    case "REFUNDED":
      return "Refunded";
    case "CANCELLED":
      return "Cancelled";
    case "FAILED":
      return "Failed";
  }
}

/**
 * Status icons — small glyph shown alongside the label in badge-heavy
 * surfaces (tip status card, profile rows). Kept optional; call sites
 * opt in with <Badge>{icon}{label}</Badge>.
 */
export function statusBadgeIcon(status: TipStatus): ReactNode {
  const size = 10;
  const stroke = 2.4;
  switch (status) {
    case "CLAIMABLE":
      return <Dot color="#B6A9FF" pulse />;
    case "PENDING":
      return <Dot color="#F4B942" pulse />;
    case "CLAIMED":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M20 6 9 17l-5-5"
            stroke="#7BE3DB"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "REFUNDED":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M3 12a9 9 0 1 0 3-6.7"
            stroke="#A8D4C4"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <path d="M3 4v5h5" stroke="#A8D4C4" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "CANCELLED":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="#E4AAB6"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        </svg>
      );
    case "EXPIRED":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="#6B6B8A" strokeWidth={stroke} />
          <path d="M12 7v5l3 2" stroke="#6B6B8A" strokeWidth={stroke} strokeLinecap="round" />
        </svg>
      );
    case "FAILED":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 8v4M12 16h.01" stroke="#FF8E8E" strokeWidth={stroke} strokeLinecap="round" />
          <circle cx="12" cy="12" r="9" stroke="#FF8E8E" strokeWidth={stroke} />
        </svg>
      );
    case "DRAFT":
      return <Dot color="#A8A8C8" />;
    default:
      return null;
  }
}

function Dot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2 items-center justify-center">
      {pulse && (
        <span
          aria-hidden
          className="absolute inline-block h-2 w-2 animate-ping rounded-full"
          style={{ backgroundColor: color, opacity: 0.5 }}
        />
      )}
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}
