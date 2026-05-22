import { secondsPerBurnBlock, type PoxInfo } from "./poxInfo";

/** Fallback when PoX-4 get-pox-info is unavailable. */
export const EST_SECONDS_PER_BURN_BLOCK = Number(
  import.meta.env.VITE_ESTIMATED_SECONDS_PER_BURN_BLOCK ?? 30,
);

export function burnBlockDurationSec(poxInfo?: PoxInfo | null): number {
  if (poxInfo) return secondsPerBurnBlock(poxInfo);
  return EST_SECONDS_PER_BURN_BLOCK;
}

export function formatApproxDuration(totalSec: number): string {
  const n = Math.max(0, Math.floor(totalSec));
  if (n <= 0) return "0s";
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
