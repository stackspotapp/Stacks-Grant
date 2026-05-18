import { Cl } from "@stacks/transactions";
import type { StacksNetwork } from "@stacks/network";
import { callReadOnly } from "./stacks";
import { clarityToDisplay } from "./clarityDisplay";
import type { RegisteredPot } from "./events";

export type PotLiveState = {
  potValue?: number;
  participantsCount?: number;
  rewardAmount?: number;
  locked?: boolean;
  cancelled?: boolean;
  lockBurnHeight?: number;
  winnerId?: number;
  winnerAddress?: string;
  poolConfig?: {
    joinEnd: number;
    prepareStart: number;
    cycleEnd: number;
    rewardRelease: number;
  };
  rawDetails?: unknown;
  errors: string[];
  fetchedAt?: number;
};

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

  const poolConfigRaw = toRecord(details["pool-config"]);
  const winners = toRecord(details["winners-values"]);

  return {
    rawDetails,
    potValue: toNumber(details["pot-value"]),
    participantsCount: toNumber(details["pot-participants-count"]),
    rewardAmount: toNumber(details["pot-reward-amount"]),
    locked: toBool(details["pot-locked"]),
    cancelled: toBool(details["pot-cancelled"]),
    lockBurnHeight: toNumber(details["pot-lock-burn-height"]),
    winnerId: winners ? toNumber(winners["winner-id"]) : undefined,
    winnerAddress: winners
      ? toPrincipal(winners["winner-address"])
      : undefined,
    poolConfig: poolConfigRaw
      ? {
          joinEnd: toNumber(poolConfigRaw["join-end"]) ?? 0,
          prepareStart: toNumber(poolConfigRaw["prepare-start"]) ?? 0,
          cycleEnd: toNumber(poolConfigRaw["cycle-end"]) ?? 0,
          rewardRelease: toNumber(poolConfigRaw["reward-release"]) ?? 0,
        }
      : undefined,
    errors,
    fetchedAt: Date.now(),
  };
}

export function potTraitClarity(pot: RegisteredPot) {
  return Cl.contractPrincipal(pot.contractAddress, pot.contractName);
}
