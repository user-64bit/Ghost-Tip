import type { HTMLAttributes } from "react";
import type { TipStatus } from "../../types/tip";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "primary" | "accent" | "warning" | "danger" | "muted";
}

const tones: Record<NonNullable<BadgeProps["tone"]>, string> = {
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
};

export function Badge({
  tone = "neutral",
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
      {children}
    </span>
  );
}

export function statusBadgeTone(status: TipStatus): BadgeProps["tone"] {
  switch (status) {
    case "DRAFT":
      return "muted";
    case "PENDING":
      return "warning";
    case "CLAIMABLE":
      return "primary";
    case "CLAIMED":
      return "accent";
    case "EXPIRED":
      return "muted";
    case "REFUNDED":
      return "neutral";
    case "CANCELLED":
      return "muted";
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
