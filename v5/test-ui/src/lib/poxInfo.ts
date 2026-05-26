import type { StacksNetwork } from "@stacks/network";
import { parseContractId } from "../config/contracts";
import { DEPLOYER_ADDRESS } from "../config/network";
import { effectiveRewardCycleLength } from "../config/devnetPox";
import { callReadOnly } from "./stacks";
import { clarityToDisplay } from "./clarityDisplay";

/** Boot PoX-4 on devnet. Override via VITE_POX_4_CONTRACT. */
export const POX_4_CONTRACT_ID =
  import.meta.env.VITE_POX_4_CONTRACT ??
  "ST000000000000000000002AMW42H.pox-4";

export type PoxInfo = {
  rewardCycleLength: number;
  prepareCycleLength: number;
  firstBurnchainBlockHeight: number;
  rewardCycleId: number;
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
  const rewardCycleLength = toNum(o["reward-cycle-length"]);
  if (rewardCycleLength === undefined || rewardCycleLength <= 0) return null;
  return {
    rewardCycleLength,
    prepareCycleLength: toNum(o["prepare-cycle-length"]) ?? 0,
    firstBurnchainBlockHeight:
      toNum(o["first-burnchain-block-height"]) ?? 0,
    rewardCycleId: toNum(o["reward-cycle-id"]) ?? 0,
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

/** Prefer live PoX-4; fall back to devnet env default. */
export function rewardCycleLengthFromPox(pox: PoxInfo | null | undefined): number {
  const fromChain = pox?.rewardCycleLength;
  if (fromChain !== undefined && fromChain > 0) return fromChain;
  return effectiveRewardCycleLength();
}
