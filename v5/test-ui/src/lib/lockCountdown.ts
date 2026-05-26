import { secondsPerBurnBlock } from "../config/devnetPox";

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
};

export function burnBlockDurationSec(): number {
  return secondsPerBurnBlock();
}

/** Wall-clock ms until an absolute burn height from the current tip. */
export function msUntilBurnHeight(
  blocksUntil: number,
  secPerBurn = burnBlockDurationSec(),
): number {
  return Math.max(0, blocksUntil) * secPerBurn * 1000;
}

export function targetTimestampFromBlocks(
  blocksUntil: number,
  secPerBurn = burnBlockDurationSec(),
): number {
  return Date.now() + msUntilBurnHeight(blocksUntil, secPerBurn);
}

export function countdownPartsFromMs(timeRemainingMs: number): CountdownParts {
  const remaining = Math.max(0, timeRemainingMs);
  return {
    days: Math.floor(remaining / (24 * 60 * 60 * 1000)),
    hours: Math.floor(
      (remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000),
    ),
    minutes: Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000)),
  };
}

/** Human label: `3h 20m`, `1d 2h 5m`, etc. */
export function formatCountdownParts(parts: CountdownParts): string {
  if (parts.days > 0) {
    return `${parts.days}d ${parts.hours}h ${parts.minutes}m`;
  }
  if (parts.hours > 0) {
    return `${parts.hours}h ${parts.minutes}m`;
  }
  return `${parts.minutes}m`;
}

/** @deprecated Use formatCountdownParts for timestamp-based countdowns. */
export function formatApproxDuration(totalSec: number): string {
  return formatCountdownParts(countdownPartsFromMs(totalSec * 1000));
}
