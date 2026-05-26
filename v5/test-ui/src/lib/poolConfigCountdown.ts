import type { PoolConfig } from "./potDetails";
import {
  countdownPartsFromMs,
  type CountdownParts,
} from "./lockCountdown";
import { secondsPerBurnBlock } from "../config/devnetPox";

/** Devnet default: 10 minutes per burn block (600 s). */
export const POOL_CONFIG_SECONDS_PER_BURN_BLOCK = secondsPerBurnBlock();

export type PoolConfigCountdownState = {
  targetBlock: number;
  blocksRemaining: number;
  secondsRemaining: number;
  parts: CountdownParts;
  /** `true` when `currentBurnHeight >= targetBlock`. */
  reached: boolean;
};

export type PoolConfigCountdowns = {
  joinEndCountdown: PoolConfigCountdownState;
  prepareCountdown: PoolConfigCountdownState;
  cycleEndCountdown: PoolConfigCountdownState;
  rewardReleaseCountdown: PoolConfigCountdownState;
};

export function blocksRemainingToTarget(
  targetBlock: number,
  currentBurnHeight: number,
): number {
  return Math.max(0, targetBlock - currentBurnHeight);
}

/**
 * Blocks until reward release, with one-cycle rollover when within a cycle of release.
 * Matches legacy: if `(rewardRelease - tip) < rewardCycleLength` then add `rewardCycleLength`.
 */
export function blocksUntilRewardRelease(
  rewardRelease: number,
  currentBurnHeight: number,
  rewardCycleLength: number,
): number {
  let blocksUntil = rewardRelease - currentBurnHeight;
  if (blocksUntil < rewardCycleLength) {
    blocksUntil += rewardCycleLength;
  }
  return Math.max(0, blocksUntil);
}

/** Effective target burn height for the reward-release countdown. */
export function effectiveRewardReleaseTarget(
  rewardRelease: number,
  currentBurnHeight: number,
  rewardCycleLength: number,
): number {
  return currentBurnHeight + blocksUntilRewardRelease(
    rewardRelease,
    currentBurnHeight,
    rewardCycleLength,
  );
}

export function secondsRemainingFromBlocks(
  blocksRemaining: number,
  secondsPerBlock = POOL_CONFIG_SECONDS_PER_BURN_BLOCK,
): number {
  return Math.max(0, blocksRemaining) * secondsPerBlock;
}

export function buildPoolConfigCountdownState(
  targetBlock: number,
  currentBurnHeight: number,
  secondsPerBlock = POOL_CONFIG_SECONDS_PER_BURN_BLOCK,
): PoolConfigCountdownState {
  const blocksRemaining = blocksRemainingToTarget(
    targetBlock,
    currentBurnHeight,
  );
  const secondsRemaining = secondsRemainingFromBlocks(
    blocksRemaining,
    secondsPerBlock,
  );
  return {
    targetBlock,
    blocksRemaining,
    secondsRemaining,
    parts: countdownPartsFromMs(secondsRemaining * 1000),
    reached: blocksRemaining === 0,
  };
}

/** All pool lifecycle countdowns from `get-pool-config` burn heights. */
export function buildPoolConfigCountdowns(
  poolConfig: PoolConfig,
  currentBurnHeight: number,
  secondsPerBlock = POOL_CONFIG_SECONDS_PER_BURN_BLOCK,
): PoolConfigCountdowns {
  return {
    joinEndCountdown: buildPoolConfigCountdownState(
      poolConfig.joinEnd,
      currentBurnHeight,
      secondsPerBlock,
    ),
    prepareCountdown: buildPoolConfigCountdownState(
      poolConfig.prepareStart,
      currentBurnHeight,
      secondsPerBlock,
    ),
    cycleEndCountdown: buildPoolConfigCountdownState(
      poolConfig.cycleEnd,
      currentBurnHeight,
      secondsPerBlock,
    ),
    rewardReleaseCountdown: buildPoolConfigCountdownState(
      poolConfig.rewardRelease,
      currentBurnHeight,
      secondsPerBlock,
    ),
  };
}
