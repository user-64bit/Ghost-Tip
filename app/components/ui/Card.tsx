import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
  raised?: boolean;
}

export function Card({
  glow = false,
  raised = false,
  className = "",
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        "relative rounded-2xl border border-border bg-surface overflow-hidden",
        raised ? "bg-surface-raised" : "",
        glow ? "spectral-border" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
