import { Link } from "react-router-dom";
import { useMemo } from "react";
import { Layers, Lock, Loader2, Trophy, Users } from "lucide-react";
import type { RegisteredPot } from "../lib/events";
import { type PotLiveState, isSequentialPotType } from "../lib/potDetails";
import {
  formatMicroAmount,
  formatMicroStx,
  rewardTokenSymbol,
  shortPrincipal,
} from "../lib/stacks";
import { formatCountdownParts } from "../lib/lockCountdown";
import type { PoolConfigCountdownState } from "../lib/poolConfigCountdown";
import { POOL_CONFIG_SECONDS_PER_BURN_BLOCK } from "../lib/poolConfigCountdown";
import { rewardCycleLengthFromPox } from "../lib/poxInfo";
import type { PoxInfo } from "../lib/poxInfo";
import { usePoolConfigCountdowns } from "../hooks/usePoolConfigCountdowns";

function DetailCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded bg-black/20 p-2">
      <p className="text-[var(--color-muted)]">{label}</p>
      <p className={mono ? "truncate font-mono text-[10px]" : ""}>{value}</p>
    </div>
  );
}

function PoolConfigCountdownRow({
  label,
  countdown,
  highlight,
}: {
  label: string;
  countdown: PoolConfigCountdownState;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-100"
          : "font-mono text-[10px] text-slate-400"
      }
    >
      <span className="text-[var(--color-muted)]">{label}</span>{" "}
      <span className="text-slate-300">burn {countdown.targetBlock}</span>
      {countdown.reached ? (
        <span className="text-emerald-300"> · reached</span>
      ) : (
        <>
          <span className="tabular-nums text-amber-100">
            {" "}
            · {formatCountdownParts(countdown.parts)}
          </span>
          <span className="text-slate-500">
            {" "}
            (~{countdown.blocksRemaining} burn
            {countdown.blocksRemaining === 1 ? "" : "s"})
          </span>
        </>
      )}
    </div>
  );
}

export function PotCard({
  pot,
  live,
  refreshing,
  currentBurnHeight,
  poxInfo,
}: {
  pot: RegisteredPot;
  live?: PotLiveState;
  refreshing?: boolean;
  /** Chain burn tip from /v2/info (maps to pox `current_burnchain_block_height`). */
  currentBurnHeight?: number;
  /** Live `get-pox-info` from boot pox-4 for reward-cycle-length. */
  poxInfo?: PoxInfo | null;
}) {
  const potId = `${pot.contractAddress}.${pot.contractName}`;
  const hasLive = live && live.errors.length === 0 && live.fetchedAt;
  const liveError = live?.errors[0];
  const isSequential = isSequentialPotType(pot.potType);

  const rewardCycleLength = useMemo(
    () => rewardCycleLengthFromPox(poxInfo),
    [poxInfo],
  );

  const poolCountdowns = usePoolConfigCountdowns(
    live?.poolConfig,
    currentBurnHeight,
    rewardCycleLength,
    POOL_CONFIG_SECONDS_PER_BURN_BLOCK,
  );

  const sequentialPayoutLabel = useMemo(() => {
    if (!isSequential || !live || !hasLive) return null;
    const total = live.participantsCount ?? 0;
    if (total <= 0) return null;
    if (live.sessionEnded) return `All ${total} payouts complete`;
    const next = (live.nextPaymentId ?? 0) + 1;
    return `Next payout ${next} of ${total}`;
  }, [isSequential, live, hasLive]);

  const activePhase = useMemo(() => {
    if (!poolCountdowns) return null;
    const {
      joinEndCountdown,
      prepareCountdown,
      cycleEndCountdown,
      rewardReleaseCountdown,
    } = poolCountdowns;
    if (!joinEndCountdown.reached) return "join" as const;
    if (!prepareCountdown.reached) return "prepare" as const;
    if (!cycleEndCountdown.reached) return "cycle" as const;
    if (!rewardReleaseCountdown.reached) return "reward" as const;
    return "done" as const;
  }, [poolCountdowns]);

  const { rewardReleaseCountdown } = poolCountdowns ?? {};

  return (
    <Link
      to={`/pot/${encodeURIComponent(pot.contractAddress)}/${encodeURIComponent(pot.contractName)}`}
      className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4 transition-colors hover:border-[var(--color-accent)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--color-muted)]">Pot #{pot.potId}</p>
          <h3 className="font-semibold text-white">{pot.potName}</h3>
          <p className="text-sm text-[var(--color-muted)]">{pot.potType}</p>
        </div>
        {refreshing ? (
          <Loader2 size={18} className="shrink-0 animate-spin text-[var(--color-muted)]" />
        ) : (
          <Layers className="shrink-0 text-[var(--color-accent)]" size={20} />
        )}
      </div>

      <p
        className="mt-2 truncate font-mono text-[10px] text-slate-400"
        title={potId}
      >
        {potId}
      </p>

      <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
        Registration
      </p>
      <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
        <DetailCell
          label="Min join"
          value={formatMicroStx(pot.potMinAmount)}
        />
        <DetailCell label="Max participants" value={String(pot.potMaxParticipants)} />
        <DetailCell label="Reward token" value={pot.potRewardToken} />
        <DetailCell label="Reg. burn" value={String(pot.burnBlockHeight)} />
      </div>

      <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
        Live · get-pot-details
      </p>

      {liveError && (
        <p className="mt-1 text-xs text-[var(--color-error)]">{liveError}</p>
      )}

      {!hasLive && !liveError && (
        <p className="mt-1 text-xs text-[var(--color-muted)]">Loading pot state…</p>
      )}

      {hasLive && (
        <>
          <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
            <DetailCell
              label="Treasury"
              value={formatMicroStx(live.potValue ?? 0)}
            />
            <DetailCell
              label="Joined"
              value={`${live.participantsCount ?? 0} / ${pot.potMaxParticipants}`}
            />
            <DetailCell
              label="Reward pool"
              value={formatMicroAmount(
                live.rewardAmount ?? 0,
                rewardTokenSymbol(pot.potRewardToken),
              )}
            />
            <DetailCell
              label="Lock burn"
              value={String(live.lockBurnHeight ?? 0)}
            />
          </div>

          {live.winnerAddress && (
            <div className="mt-2 flex items-center gap-2 rounded bg-[var(--color-accent)]/10 px-2 py-1.5 text-xs">
              <Trophy size={14} className="text-[var(--color-accent)]" />
              <span>
                Winner #{live.winnerId ?? "?"}:{" "}
                <span className="font-mono text-[10px]">
                  {live.winnerAddress.slice(0, 12)}…
                </span>
              </span>
            </div>
          )}

          {poolCountdowns && (
            <div className="mt-2 rounded border border-[var(--color-border)]/50 bg-black/10 p-2">
              <p className="mb-1.5 text-[10px] font-medium text-[var(--color-muted)]">
                Pool lifecycle · get-pool-config
                {currentBurnHeight !== undefined && (
                  <span className="font-mono font-normal text-slate-500">
                    {" "}
                    · tip {currentBurnHeight}
                  </span>
                )}
              </p>
              <div className="space-y-1">
                <PoolConfigCountdownRow
                  label="Join ends"
                  countdown={poolCountdowns.joinEndCountdown}
                  highlight={activePhase === "join"}
                />
                <PoolConfigCountdownRow
                  label="Prepare starts"
                  countdown={poolCountdowns.prepareCountdown}
                  highlight={activePhase === "prepare"}
                />
                <PoolConfigCountdownRow
                  label="Cycle ends"
                  countdown={poolCountdowns.cycleEndCountdown}
                  highlight={activePhase === "cycle"}
                />
                <PoolConfigCountdownRow
                  label="Reward release"
                  countdown={poolCountdowns.rewardReleaseCountdown}
                  highlight={activePhase === "reward" || activePhase === "done"}
                />
              </div>
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            {live.locked && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
                <Lock size={10} /> Locked
              </span>
            )}
            {live.cancelled && (
              <span className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] text-red-300">
                Cancelled
              </span>
            )}
            {!live.locked && !live.cancelled && (
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                Open
              </span>
            )}
          </div>

          {live.locked && !live.cancelled && isSequential && live.sessionEnded && (
            <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-100">
              <span className="font-medium">{sequentialPayoutLabel}</span>
            </div>
          )}

          {live.locked &&
            !live.cancelled &&
            !(isSequential && live.sessionEnded) &&
            rewardReleaseCountdown && (
              <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-100">
                {sequentialPayoutLabel && (
                  <p className="mb-1 font-medium text-amber-50/90">
                    {sequentialPayoutLabel}
                  </p>
                )}
                {rewardReleaseCountdown.reached ? (
                  <span className="font-medium text-emerald-200">
                    Reward release reached (burn ≥{" "}
                    {rewardReleaseCountdown.targetBlock})
                    {isSequential && live.nextPaymentId !== undefined
                      ? ` · round ${live.nextPaymentId + 1}`
                      : ""}
                  </span>
                ) : (
                  <>
                    <span className="font-medium">Until reward release: </span>
                    <span className="font-mono tabular-nums">
                      {formatCountdownParts(rewardReleaseCountdown.parts)}
                    </span>
                    <span className="text-amber-200/80">
                      {" "}
                      (~{rewardReleaseCountdown.blocksRemaining} burn
                      {rewardReleaseCountdown.blocksRemaining === 1 ? "" : "s"}{" "}
                      · target {rewardReleaseCountdown.targetBlock})
                    </span>
                  </>
                )}
              </div>
            )}

          {live.fetchedAt && (
            <p className="mt-2 text-[10px] text-[var(--color-muted)]">
              Updated {new Date(live.fetchedAt).toLocaleTimeString()}
            </p>
          )}
        </>
      )}

      <p
        className="mt-2 flex items-center gap-1 text-[10px] text-[var(--color-muted)]"
        title={pot.potOwner}
      >
        <Users size={10} />
        Owner{" "}
        <span className="font-mono">{shortPrincipal(pot.potOwner)}</span>
      </p>
    </Link>
  );
}
