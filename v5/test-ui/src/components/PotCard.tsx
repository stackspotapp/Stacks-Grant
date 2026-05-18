import { Link } from "react-router-dom";
import { Layers, Lock, Loader2, Trophy, Users } from "lucide-react";
import type { RegisteredPot } from "../lib/events";
import type { PotLiveState } from "../lib/potDetails";
import { formatMicroStx, shortPrincipal } from "../lib/stacks";

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

export function PotCard({
  pot,
  live,
  refreshing,
}: {
  pot: RegisteredPot;
  live?: PotLiveState;
  refreshing?: boolean;
}) {
  const potId = `${pot.contractAddress}.${pot.contractName}`;
  const hasLive = live && live.errors.length === 0 && live.fetchedAt;
  const liveError = live?.errors[0];

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
              value={formatMicroStx(live.rewardAmount ?? 0)}
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

          {live.poolConfig && (
            <div className="mt-2 rounded border border-[var(--color-border)]/50 bg-black/10 p-2 text-[10px] text-slate-400">
              <p className="mb-1 text-[var(--color-muted)]">Pool timing (burn height)</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
                <span>join-end {live.poolConfig.joinEnd}</span>
                <span>prepare {live.poolConfig.prepareStart}</span>
                <span>cycle-end {live.poolConfig.cycleEnd}</span>
                <span>release {live.poolConfig.rewardRelease}</span>
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
