import contractsJson from "../../public/contracts.json";
import {
  extractContractPrincipal,
  parseContractPrincipal,
} from "../lib/principal";
import { DEPLOYER_ADDRESS } from "./network";

export type ContractEntry = {
  name: string;
  address: string;
  label?: string;
};

export const CONTRACTS: ContractEntry[] = contractsJson.contracts;

export const POOL_POX_TUPLE = contractsJson.poolPoxAddress;

export const STACKSPOTS_ID = `${DEPLOYER_ADDRESS}.stackspots`;
export const REGISTRY_ID = `${DEPLOYER_ADDRESS}.stackspot-registry`;

export const CORE_CONTRACTS = [
  { id: `${DEPLOYER_ADDRESS}.stackspots`, label: "Stackspots", category: "platform" },
  { id: `${DEPLOYER_ADDRESS}.stackspot-distribute`, label: "Distribute", category: "platform" },
  { id: `${DEPLOYER_ADDRESS}.stackspot-admin`, label: "Admin", category: "platform" },
  { id: `${DEPLOYER_ADDRESS}.sim-pox-4-multi-pool-v1`, label: "Multi-pool", category: "pox" },
  { id: `${DEPLOYER_ADDRESS}.sim-pox-4`, label: "Sim PoX-4", category: "pox" },
  { id: `${DEPLOYER_ADDRESS}.sbtc-token`, label: "sBTC Token", category: "rewards" },
  { id: `${DEPLOYER_ADDRESS}.init-admin`, label: "Init Admin", category: "platform" },
] as const;

export function contractId(address: string, name: string) {
  return `${address}.${name}`;
}

export const IDS = {
  deployer: DEPLOYER_ADDRESS,
  stackspots: STACKSPOTS_ID,
  registry: REGISTRY_ID,
  pool: contractId(DEPLOYER_ADDRESS, "sim-pox-4-multi-pool-v1"),
  pox: contractId(DEPLOYER_ADDRESS, "sim-pox-4"),
  sbtc: contractId(DEPLOYER_ADDRESS, "sbtc-token"),
  distribute: contractId(DEPLOYER_ADDRESS, "stackspot-distribute"),
} as const;

export function parseContractId(id: string): { address: string; name: string } {
  const trimmed = id.trim();
  const strict =
    parseContractPrincipal(trimmed) ?? extractContractPrincipal(trimmed);
  if (strict) {
    return { address: strict.address, name: strict.name };
  }

  const dot = trimmed.lastIndexOf(".");
  if (dot > 0) {
    const address = trimmed.slice(0, dot);
    const name = trimmed.slice(dot + 1);
    const fallback = parseContractPrincipal(`${address}.${name}`);
    if (fallback) return { address: fallback.address, name: fallback.name };
  }

  throw new Error(`Invalid contract id: ${id}`);
}

export function parsePrincipalContract(principal: string): {
  address: string;
  name: string;
} | null {
  const p = parseContractPrincipal(principal);
  if (!p) return null;
  return { address: p.address, name: p.name };
}
