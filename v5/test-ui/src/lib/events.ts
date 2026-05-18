import { STACKS_API_URL } from "../config/network";
import { IDS } from "../config/contracts";
import { fieldContractPrincipal, parseContractPrincipal } from "./principal";

export type RegisteredPot = {
  potId: number;
  potAddress: string;
  potOwner: string;
  potName: string;
  potType: string;
  potCycles: number;
  potRewardToken: string;
  potMinAmount: number;
  potMaxParticipants: number;
  potDeployFee: number;
  burnBlockHeight: number;
  stacksBlockHeight: number;
  txId: string;
  blockHeight: number;
  contractAddress: string;
  contractName: string;
};

type ContractLogEvent = {
  event_index: number;
  event_type: string;
  tx_id: string;
  contract_log?: {
    contract_id: string;
    topic: string;
    value: {
      repr: string;
      hex?: string;
    };
  };
  block_height: number;
};

type EventsPage = {
  results: ContractLogEvent[];
  offset: number;
  limit: number;
  total: number;
};

function fieldUInt(repr: string, field: string): number {
  const m = repr.match(new RegExp(`\\(${field}\\s+u(\\d+)\\)`));
  return m ? Number(m[1]) : 0;
}

function fieldAscii(repr: string, field: string): string {
  const quoted = repr.match(
    new RegExp(`\\(${field}\\s+(?:\\(string-ascii \\d+\\) )?\"([^\"]*)\"\\)`),
  );
  if (quoted?.[1]) return quoted[1];
  const loose = repr.match(new RegExp(`${field}[^\"]*\"([^\"]+)\"`));
  return loose?.[1] ?? "";
}

function parsePotRegisteredEvent(
  repr: string,
  meta: { txId: string; blockHeight: number },
): RegisteredPot | null {
  if (!repr.includes("pot registered")) return null;

  const potAddress = fieldContractPrincipal(repr, "pot-address");
  const parsed = parseContractPrincipal(potAddress);
  if (!parsed) return null;

  const potOwnerRaw = fieldContractPrincipal(repr, "pot-owner");
  const potOwnerParsed = parseContractPrincipal(potOwnerRaw);

  return {
    potId: fieldUInt(repr, "pot-id"),
    potAddress: parsed.full,
    potOwner: potOwnerParsed?.full ?? potOwnerRaw,
    potName: fieldAscii(repr, "pot-name") || parsed.name,
    potType: fieldAscii(repr, "pot-type"),
    potCycles: fieldUInt(repr, "pot-cycles"),
    potRewardToken: fieldAscii(repr, "pot-reward-token"),
    potMinAmount: fieldUInt(repr, "pot-min-amount"),
    potMaxParticipants: fieldUInt(repr, "pot-max-participants"),
    potDeployFee: fieldUInt(repr, "pot-deploy-fee"),
    burnBlockHeight: fieldUInt(repr, "burn-block-height"),
    stacksBlockHeight: fieldUInt(repr, "stacks-block-height"),
    txId: meta.txId,
    blockHeight: meta.blockHeight,
    contractAddress: parsed.address,
    contractName: parsed.name,
  };
}

async function fetchContractEvents(
  contractId: string,
  maxPages = 10,
): Promise<ContractLogEvent[]> {
  const all: ContractLogEvent[] = [];
  const limit = 50;
  let offset = 0;

  for (let page = 0; page < maxPages; page++) {
    const url = `${STACKS_API_URL}/extended/v1/contract/${encodeURIComponent(contractId)}/events?limit=${limit}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const data = (await res.json()) as EventsPage;
    all.push(...data.results);
    if (data.results.length < limit) break;
    offset += limit;
  }

  return all;
}

export async function fetchRegisteredPots(): Promise<RegisteredPot[]> {
  const stackspotsEvents = await fetchContractEvents(IDS.stackspots);

  const byAddress = new Map<string, RegisteredPot>();

  for (const ev of stackspotsEvents) {
    const log = ev.contract_log;
    if (!log || log.topic !== "print") continue;
    const repr = log.value?.repr ?? "";
    const pot = parsePotRegisteredEvent(repr, {
      txId: ev.tx_id,
      blockHeight: ev.block_height,
    });
    if (pot) byAddress.set(pot.potAddress, pot);
  }

  return [...byAddress.values()].sort((a, b) => b.potId - a.potId);
}
