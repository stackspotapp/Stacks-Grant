import { Cl } from "@stacks/transactions";
import type { StacksNetwork } from "@stacks/network";
import { callReadOnly } from "./stacks";
import { clarityToDisplay } from "./clarityDisplay";
import type { RegisteredPot } from "./events";

export type PoolConfig = {
  joinEnd: number;
  prepareStart: number;
  cycleEnd: number;
  rewardRelease: number;
};

export type PotLiveState = {
  potValue?: number;
  participantsCount?: number;
  rewardAmount?: number;
  locked?: boolean;
  cancelled?: boolean;
  lockBurnHeight?: number;
  /** PoX cycle count from contract (crowdfund uses this in claim timing). */
  potCycle?: number;
  /** Sequential: index of the next payout (0-based). */
  nextPaymentId?: number;
  /** Sequential: all participant payouts finished. */
  sessionEnded?: boolean;
  winnerId?: number;
  winnerAddress?: string;
  /** On-chain `get-pool-config` (also embedded in get-pot-details as pool-config). */
  poolConfig?: PoolConfig;
  rawDetails?: unknown;
  errors: string[];
  fetchedAt?: number;
};

export function isSequentialPotType(potType: string): boolean {
  return potType.toLowerCase().includes("sequential");
}

/**
 * Extra burn blocks after reward-release before the UI treats a sequential pot as
 * claimable. Non-final claims call extend-delegate-treasury → delegate-stack-stx,
 * which only succeeds in the second half of the PoX cycle (can-lock-now); this
 * buffer approximates that window after each payout round. On a 20-block devnet
 * cycle, half-cycle is 10 burns — same value as this buffer.
 */
export const SEQUENTIAL_CLAIM_DELEGATE_BUFFER_BLOCKS = 10;

/**
 * Sequential claim threshold after the first payout.
 * Mirrors extend-initialization: midpoint of PoX reward cycle (k + 1) after lock,
 * where cycle-end from pool-config is the start of the first post-lock cycle.
 */
export function sequentialMidCycleThreshold(
  cycleEnd: number,
  nextPaymentId: number,
  rewardCycleLength: number,
): number {
  const k = Math.max(1, nextPaymentId);
  return cycleEnd + k * rewardCycleLength + Math.floor(rewardCycleLength / 2);
}

/**
 * Absolute burn height threshold for claim (`current_burn > threshold`).
 * Sequential: first payout after reward-release + extend buffer; later payouts at
 * the midpoint of the (next-payment-id + 1) PoX cycle (see extend-initialization).
 * Crowdfund: base reward-release + (pot-cycle - 1) × reward-cycle-length.
 * Jackpot: reward-release from pool-config (cycles baked into get-pool-config).
 */
export function claimThresholdBurnHeight(
  live: Pick<PotLiveState, "poolConfig" | "potCycle" | "nextPaymentId">,
  potType: string,
  rewardCycleLength?: number,
): number | null {
  const rr = live.poolConfig?.rewardRelease;
  if (rr === undefined || rr <= 0) return null;
  if (isSequentialPotType(potType) && rewardCycleLength) {
    const k = live.nextPaymentId ?? 0;
    if (k === 0) {
      return rr + SEQUENTIAL_CLAIM_DELEGATE_BUFFER_BLOCKS;
    }
    const cycleEnd = live.poolConfig?.cycleEnd;
    if (cycleEnd === undefined || cycleEnd <= 0) return null;
    return sequentialMidCycleThreshold(cycleEnd, k, rewardCycleLength);
  }
  const isCrowdfund = potType.toLowerCase().includes("crowdfund");
  const cycles = live.potCycle ?? 1;
  if (isCrowdfund && cycles > 1 && rewardCycleLength) {
    return rr + (cycles - 1) * rewardCycleLength;
  }
  return rr;
}

/** First burn height at which the next claim window can open. */
export function firstClaimableBurnHeight(
  live: Pick<PotLiveState, "poolConfig" | "potCycle" | "nextPaymentId">,
  potType: string,
  rewardCycleLength?: number,
): number | null {
  const t = claimThresholdBurnHeight(live, potType, rewardCycleLength);
  if (t === null) return null;
  return t + 1;
}

function asDetailRecord(raw: unknown): Record<string, unknown> | null {
  const displayed = clarityToDisplay(raw);
  if (displayed && typeof displayed === "object" && !Array.isArray(displayed)) {
    return displayed as Record<string, unknown>;
  }
  return null;
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function toBool(value: unknown): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return Boolean(value);
}

function toPrincipal(value: unknown): string | undefined {
  if (typeof value === "string" && /^(ST|SP)[A-Z0-9]+/.test(value)) {
    return value;
  }
  return undefined;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parsePoolConfig(raw: unknown): PoolConfig | undefined {
  const o = toRecord(raw);
  if (!o) return undefined;
  const joinEnd = toNumber(o["join-end"]);
  const prepareStart = toNumber(o["prepare-start"]);
  const cycleEnd = toNumber(o["cycle-end"]);
  const rewardRelease = toNumber(o["reward-release"]);
  if (
    joinEnd === undefined ||
    prepareStart === undefined ||
    cycleEnd === undefined ||
    rewardRelease === undefined
  ) {
    return undefined;
  }
  return { joinEnd, prepareStart, cycleEnd, rewardRelease };
}

async function fetchPoolConfig(
  base: {
    contractAddress: string;
    contractName: string;
    senderAddress: string;
    network: StacksNetwork;
  },
): Promise<PoolConfig | undefined> {
  try {
    const raw = await callReadOnly({
      ...base,
      functionName: "get-pool-config",
      functionArgs: [],
    });
    return parsePoolConfig(clarityToDisplay(raw));
  } catch {
    return undefined;
  }
}

export async function fetchPotLiveState(
  pot: RegisteredPot,
  senderAddress: string,
  network: StacksNetwork,
): Promise<PotLiveState> {
  const errors: string[] = [];
  const base = {
    contractAddress: pot.contractAddress,
    contractName: pot.contractName,
    senderAddress,
    network,
  };

  let rawDetails: unknown;
  try {
    rawDetails = await callReadOnly({
      ...base,
      functionName: "get-pot-details",
      functionArgs: [],
    });
  } catch (e) {
    errors.push(
      `get-pot-details: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { rawDetails, errors };
  }

  const details = asDetailRecord(rawDetails);
  if (!details) {
    errors.push("get-pot-details: could not parse response");
    return { rawDetails, errors, fetchedAt: Date.now() };
  }

  let poolConfig = parsePoolConfig(details["pool-config"]);
  if (!poolConfig) {
    poolConfig = await fetchPoolConfig(base);
  }
  const winners = toRecord(details["winners-values"]);

  let potCycle: number | undefined;
  let nextPaymentId: number | undefined;
  let sessionEnded: boolean | undefined;

  if (pot.potType.toLowerCase().includes("crowdfund")) {
    try {
      const cycleRaw = await callReadOnly({
        ...base,
        functionName: "get-pot-cycle",
        functionArgs: [],
      });
      const c = clarityToDisplay(cycleRaw);
      if (typeof c === "number" && Number.isFinite(c)) potCycle = c;
    } catch {
      /* ignore */
    }
  }

  if (isSequentialPotType(pot.potType)) {
    try {
      const idRaw = await callReadOnly({
        ...base,
        functionName: "get-next-payment-id",
        functionArgs: [],
      });
      const id = clarityToDisplay(idRaw);
      if (typeof id === "number" && Number.isFinite(id)) nextPaymentId = id;
    } catch {
      /* ignore */
    }
    try {
      const endedRaw = await callReadOnly({
        ...base,
        functionName: "get-pot-session-status",
        functionArgs: [],
      });
      sessionEnded = toBool(clarityToDisplay(endedRaw));
    } catch {
      /* ignore */
    }
  }

  return {
    rawDetails,
    potValue: toNumber(details["pot-value"]),
    participantsCount: toNumber(details["pot-participants-count"]),
    rewardAmount: toNumber(details["pot-reward-amount"]),
    locked: toBool(details["pot-locked"]),
    cancelled: toBool(details["pot-cancelled"]),
    lockBurnHeight: toNumber(details["pot-lock-burn-height"]),
    potCycle,
    nextPaymentId,
    sessionEnded,
    winnerId: winners ? toNumber(winners["winner-id"]) : undefined,
    winnerAddress: winners
      ? toPrincipal(winners["winner-address"])
      : undefined,
    poolConfig,
    errors,
    fetchedAt: Date.now(),
  };
}

export function potTraitClarity(pot: RegisteredPot) {
  return Cl.contractPrincipal(pot.contractAddress, pot.contractName);
}
