"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 select-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none " +
  "active:translate-y-0 hover:-translate-y-[1px]";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[0_0_0_1px_rgba(124,106,247,0.4),0_8px_30px_-12px_rgba(124,106,247,0.55)] " +
    "hover:shadow-[0_0_0_1px_rgba(124,106,247,0.6),0_12px_40px_-12px_rgba(124,106,247,0.7)]",
  secondary:
    "bg-surface-raised text-foreground border border-border hover:border-border-strong",
  ghost: "text-foreground hover:bg-surface-raised",
  danger:
    "bg-danger text-danger-foreground shadow-[0_0_0_1px_rgba(255,107,107,0.4)] hover:shadow-[0_0_0_1px_rgba(255,107,107,0.6)]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-7 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    className = "",
    children,
    disabled,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        base,
        variants[variant],
        sizes[size],
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <Spinner />
      ) : null}
      <span className={loading ? "opacity-80" : ""}>{children}</span>
    </button>
  );
});

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-current"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="3"
      />
      <path
        d="M22 12A10 10 0 0 0 12 2"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
