"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix" | "size"> {
  prefix?: ReactNode;
  suffix?: ReactNode;
  label?: string;
  hint?: string;
  error?: string;
  inputSize?: "md" | "lg";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    prefix,
    suffix,
    label,
    hint,
    error,
    inputSize = "lg",
    className = "",
    id,
    ...rest
  },
  ref
) {
  // useId() is deterministic across server + client, unlike the
  // Math.random() it replaces — otherwise the <label htmlFor=...>
  // and <input id=...> on SSR and on the client first render end up
  // with different values and React flags a hydration mismatch.
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const height = inputSize === "md" ? "h-12" : "h-14";
  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium uppercase tracking-widest text-subtle"
        >
          {label}
        </label>
      )}
      <div
        className={[
          `group relative flex w-full items-center overflow-hidden rounded-xl border border-border bg-surface`,
          `transition-colors duration-200`,
          `focus-within:border-primary/60 focus-within:shadow-[0_0_0_1px_rgba(124,106,247,0.25)]`,
          error ? "border-danger/60" : "",
          height,
        ].join(" ")}
      >
        {prefix && (
          <span className="pl-4 text-sm text-muted">{prefix}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            "flex-1 bg-transparent px-4 text-foreground outline-none placeholder:text-subtle",
            inputSize === "lg" ? "text-base" : "text-sm",
            className,
          ].join(" ")}
          {...rest}
        />
        {suffix && (
          <span className="pr-4 text-xs font-medium text-muted">{suffix}</span>
        )}
      </div>
      {(hint || error) && (
        <p
          className={`text-xs ${
            error ? "text-danger" : "text-subtle"
          }`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
