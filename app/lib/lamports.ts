import { lamports, type Lamports } from "@solana/kit";

const LAMPORTS_PER_SOL = 1_000_000_000n;

export function lamportsFromSol(sol: number): Lamports {
  return lamports(BigInt(Math.round(sol * Number(LAMPORTS_PER_SOL))));
}

/** Brand a plain bigint as Lamports for display helpers. */
export function lamports_(value: bigint): Lamports {
  return lamports(value);
}

export function lamportsToSolString(
  amount: Lamports | bigint,
  maxDecimals = 2
): string {
  const v = amount as bigint;
  const whole = v / LAMPORTS_PER_SOL;
  const fractional = v % LAMPORTS_PER_SOL;

  if (fractional === 0n) return whole.toString();

  const decimals = fractional.toString().padStart(9, "0").slice(0, maxDecimals);

  if (decimals.replace(/0+$/, "") === "") return whole.toString();

  return `${whole}.${decimals.replace(/0+$/, "")}`;
}
