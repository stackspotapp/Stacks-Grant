import type { StacksNetwork } from "@stacks/network";
import { parseContractId } from "../config/contracts";
import { DEPLOYER_ADDRESS } from "../config/network";
import { SEQUENTIAL_CLAIM_DELEGATE_BUFFER_BLOCKS } from "./potDetails";
import { callReadOnly } from "./stacks";
import { clarityToDisplay } from "./clarityDisplay";

/** Canonical devnet PoX-4 (boot contract). Override via VITE_POX_4_CONTRACT. */
export const POX_4_CONTRACT_ID =
  import.meta.env.VITE_POX_4_CONTRACT ??
  "ST000000000000000000002AMW42H.pox-4";

export type PoxInfo = {
  minAmountUstx: number;
  rewardCycleId: number;
  prepareCycleLength: number;
  firstBurnchainBlockHeight: number;
  rewardCycleLength: number;
  totalLiquidSupplyUstx: number;
};

export type ComputedPoolTiming = {
  joinEnd: number;
  prepareStart: number;
  cycleEnd: number;
  rewardRelease: number;
};

function toNum(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parsePoxInfo(raw: unknown): PoxInfo | null {
  const d = clarityToDisplay(raw);
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const o = d as Record<string, unknown>;
  const first = toNum(o["first-burnchain-block-height"]);
  const cycleLen = toNum(o["reward-cycle-length"]);
  const prepareLen = toNum(o["prepare-cycle-length"]);
  if (first === undefined || cycleLen === undefined || prepareLen === undefined) {
    return null;
  }
  return {
    minAmountUstx: toNum(o["min-amount-ustx"]) ?? 0,
    rewardCycleId: toNum(o["reward-cycle-id"]) ?? 0,
    prepareCycleLength: prepareLen,
    firstBurnchainBlockHeight: first,
    rewardCycleLength: cycleLen,
    totalLiquidSupplyUstx: toNum(o["total-liquid-supply-ustx"]) ?? 0,
  };
}

export async function fetchPoxInfo(
  network: StacksNetwork,
  senderAddress: string = DEPLOYER_ADDRESS,
): Promise<PoxInfo | null> {
  const { address, name } = parseContractId(POX_4_CONTRACT_ID);
  try {
    const raw = await callReadOnly({
      contractAddress: address,
      contractName: name,
      functionName: "get-pox-info",
      functionArgs: [],
      senderAddress,
      network,
    });
    return parsePoxInfo(raw);
  } catch {
    return null;
  }
}

/**
 * Mirrors pot `get-pool-config` using live PoX params from `.pox-4`.
 * @see stackspot-sequential-pot.clar get-pool-config
 */
export function computePoolTimingFromPox(
  pox: PoxInfo,
  lockBurnHeight: number,
): ComputedPoolTiming {
  const first = pox.firstBurnchainBlockHeight;
  const cycleLen = pox.rewardCycleLength;
  const prepareLen = pox.prepareCycleLength;
  const cycle = Math.floor((lockBurnHeight - first) / cycleLen);
  const nextCycleStart = first + (cycle + 1) * cycleLen;
  return {
    joinEnd: nextCycleStart - prepareLen - 3,
    prepareStart: nextCycleStart - prepareLen,
    cycleEnd: nextCycleStart,
    rewardRelease: nextCycleStart + 5,
  };
}

/** Devnet: burn blocks track Bitcoin; default 30s matches Devnet.toml bitcoin_controller_block_time. */
export function secondsPerBurnBlock(pox?: PoxInfo | null): number {
  void pox;
  const ms = Number(import.meta.env.VITE_BITCOIN_BLOCK_MS ?? 30_000);
  return ms / 1000;
}

export function firstClaimableBurnHeightFromPox(
  pox: PoxInfo,
  lockBurnHeight: number,
  potType: string,
  potCycle?: number,
  nextPaymentId?: number,
): number {
  const { rewardRelease } = computePoolTimingFromPox(pox, lockBurnHeight);
  const type = potType.toLowerCase();
  if (type.includes("sequential")) {
    const k = nextPaymentId ?? 0;
    return (
      rewardRelease +
      k * pox.rewardCycleLength +
      SEQUENTIAL_CLAIM_DELEGATE_BUFFER_BLOCKS +
      1
    );
  }
  const isCrowdfund = type.includes("crowdfund");
  const cycles = potCycle ?? 1;
  const threshold =
    isCrowdfund && cycles > 1
      ? rewardRelease + (cycles - 1) * pox.rewardCycleLength
      : rewardRelease;
  return threshold + 1;
}
