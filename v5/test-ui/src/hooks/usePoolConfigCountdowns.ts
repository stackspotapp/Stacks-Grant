import { useMemo } from "react";
import type { PoolConfig } from "../lib/potDetails";
import {
  POOL_CONFIG_SECONDS_PER_BURN_BLOCK,
  type PoolConfigCountdownState,
  type PoolConfigCountdowns,
  blocksRemainingToTarget,
  blocksUntilRewardRelease,
  effectiveRewardReleaseTarget,
  secondsRemainingFromBlocks,
} from "../lib/poolConfigCountdown";
import { useBurnBlockCountdown } from "./useBurnBlockCountdown";

function useNamedPoolCountdown(
  targetBlock: number | undefined,
  currentBurnHeight: number | undefined,
  secondsPerBlock: number,
  /** When set, use precomputed blocks remaining instead of target − tip. */
  blocksRemainingOverride?: number | null,
): PoolConfigCountdownState | null {
  const blocksRemaining = useMemo(() => {
    if (currentBurnHeight === undefined || !Number.isFinite(currentBurnHeight)) {
      return null;
    }
    if (blocksRemainingOverride !== undefined && blocksRemainingOverride !== null) {
      return Math.max(0, blocksRemainingOverride);
    }
    if (targetBlock === undefined) return null;
    return blocksRemainingToTarget(targetBlock, currentBurnHeight);
  }, [targetBlock, currentBurnHeight, blocksRemainingOverride]);

  const parts = useBurnBlockCountdown(
    blocksRemaining !== null && blocksRemaining > 0 ? blocksRemaining : null,
    secondsPerBlock,
  );

  return useMemo(() => {
    if (blocksRemaining === null) return null;
    const resolvedTarget =
      targetBlock ??
      (currentBurnHeight !== undefined
        ? currentBurnHeight + blocksRemaining
        : 0);
    return {
      targetBlock: resolvedTarget,
      blocksRemaining,
      secondsRemaining: secondsRemainingFromBlocks(
        blocksRemaining,
        secondsPerBlock,
      ),
      parts,
      reached: blocksRemaining === 0,
    };
  }, [targetBlock, currentBurnHeight, blocksRemaining, parts, secondsPerBlock]);
}

/**
 * Pot-specific countdowns from `get-pool-config`. Reward release uses cycle-wrap
 * logic with `rewardCycleLength` from PoX-4 `get-pox-info`.
 */
export function usePoolConfigCountdowns(
  poolConfig: PoolConfig | undefined,
  currentBurnHeight: number | undefined,
  rewardCycleLength: number | undefined,
  secondsPerBlock = POOL_CONFIG_SECONDS_PER_BURN_BLOCK,
): PoolConfigCountdowns | null {
  const rewardBlocksRemaining = useMemo(() => {
    if (
      poolConfig?.rewardRelease === undefined ||
      currentBurnHeight === undefined ||
      !Number.isFinite(currentBurnHeight) ||
      !rewardCycleLength ||
      rewardCycleLength <= 0
    ) {
      return null;
    }
    return blocksUntilRewardRelease(
      poolConfig.rewardRelease,
      currentBurnHeight,
      rewardCycleLength,
    );
  }, [poolConfig?.rewardRelease, currentBurnHeight, rewardCycleLength]);

  const rewardTargetBlock = useMemo(() => {
    if (
      poolConfig?.rewardRelease === undefined ||
      currentBurnHeight === undefined ||
      !rewardCycleLength ||
      rewardCycleLength <= 0
    ) {
      return poolConfig?.rewardRelease;
    }
    return effectiveRewardReleaseTarget(
      poolConfig.rewardRelease,
      currentBurnHeight,
      rewardCycleLength,
    );
  }, [poolConfig?.rewardRelease, currentBurnHeight, rewardCycleLength]);

  const joinEndCountdown = useNamedPoolCountdown(
    poolConfig?.joinEnd,
    currentBurnHeight,
    secondsPerBlock,
  );
  const prepareCountdown = useNamedPoolCountdown(
    poolConfig?.prepareStart,
    currentBurnHeight,
    secondsPerBlock,
  );
  const cycleEndCountdown = useNamedPoolCountdown(
    poolConfig?.cycleEnd,
    currentBurnHeight,
    secondsPerBlock,
  );
  const rewardReleaseCountdown = useNamedPoolCountdown(
    rewardTargetBlock,
    currentBurnHeight,
    secondsPerBlock,
    rewardBlocksRemaining,
  );

  return useMemo(() => {
    if (
      !joinEndCountdown ||
      !prepareCountdown ||
      !cycleEndCountdown ||
      !rewardReleaseCountdown
    ) {
      return null;
    }
    return {
      joinEndCountdown,
      prepareCountdown,
      cycleEndCountdown,
      rewardReleaseCountdown,
    };
  }, [
    joinEndCountdown,
    prepareCountdown,
    cycleEndCountdown,
    rewardReleaseCountdown,
  ]);
}
