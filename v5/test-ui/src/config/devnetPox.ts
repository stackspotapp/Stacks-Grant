/**
 * Local devnet PoX reward-cycle length in burn blocks.
 * Set via `set-burnchain-parameters` on boot pox-4; override if your chain differs.
 */
export const DEVNET_REWARD_CYCLE_LENGTH = Number(
  import.meta.env.VITE_POX_REWARD_CYCLE_LENGTH ?? 20,
);

/** One burn block = 10 minutes on local devnet (600 s / 600_000 ms). */
export const DEVNET_SECONDS_PER_BURN_BLOCK = Number(
  import.meta.env.VITE_ESTIMATED_SECONDS_PER_BURN_BLOCK ?? 10 * 60,
);

export const DEVNET_MS_PER_BURN_BLOCK = Number(
  import.meta.env.VITE_BITCOIN_BLOCK_MS ?? DEVNET_SECONDS_PER_BURN_BLOCK * 1000,
);

/** Full PoX reward cycle wall-clock duration (20 × 10 min = 3h 20m). */
export const DEVNET_CYCLE_DURATION_MS =
  DEVNET_REWARD_CYCLE_LENGTH * DEVNET_MS_PER_BURN_BLOCK;

/** Half-cycle offset used by sim-pox-4-multi-pool `can-lock-now` (extend / delegate-stack). */
export function devnetHalfCycleLength(rewardCycleLength: number): number {
  return Math.floor(rewardCycleLength / 2);
}

/** PoX reward-cycle length baked into pot contracts (matches boot pox-4 on devnet). */
export function effectiveRewardCycleLength(): number {
  return DEVNET_REWARD_CYCLE_LENGTH;
}

export function secondsPerBurnBlock(): number {
  return DEVNET_MS_PER_BURN_BLOCK / 1000;
}
