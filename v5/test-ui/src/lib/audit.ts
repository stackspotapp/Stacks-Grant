import { Cl } from "@stacks/transactions";
import type { StacksNetwork } from "@stacks/network";
import { callReadOnly } from "./stacks";
import { DEPLOYER_ADDRESS } from "../config/network";
import { IDS } from "../config/contracts";

const ADMIN = `${DEPLOYER_ADDRESS}.stackspot-admin`;

function unwrapBool(result: unknown): boolean | null {
  if (result && typeof result === "object") {
    const o = result as Record<string, unknown>;
    if (o.type === "bool" && typeof o.value === "boolean") return o.value;
    if (typeof o.value === "boolean") return o.value;
  }
  return null;
}

export async function fetchCanDeployPot(
  senderAddress: string,
  network: StacksNetwork,
): Promise<boolean | null> {
  try {
    const res = await callReadOnly({
      contractAddress: DEPLOYER_ADDRESS,
      contractName: "stackspot-admin",
      functionName: "can-deploy-pot",
      functionArgs: [],
      senderAddress,
      network,
    });
    return unwrapBool(res);
  } catch {
    return null;
  }
}

/** On-chain allowlist used by register-pot (contract-hash? of deployed principal). */
export async function fetchIsContractAllowedHash(
  contractPrincipal: string,
  senderAddress: string,
  network: StacksNetwork,
): Promise<boolean | null> {
  try {
    const res = await callReadOnly({
      contractAddress: DEPLOYER_ADDRESS,
      contractName: "stackspot-admin",
      functionName: "is-contract-allowed-hash",
      functionArgs: [Cl.principal(contractPrincipal)],
      senderAddress,
      network,
    });
    return unwrapBool(res);
  } catch {
    return null;
  }
}

export type DeployAuditStatus = {
  canDeploy: boolean | null;
  allowedHash: boolean | null;
  contractId: string;
};

export async function fetchDeployAuditStatus(
  contractId: string,
  senderAddress: string,
  network: StacksNetwork,
): Promise<DeployAuditStatus> {
  const [canDeploy, allowedHash] = await Promise.all([
    fetchCanDeployPot(senderAddress, network),
    fetchIsContractAllowedHash(contractId, senderAddress, network),
  ]);
  return { canDeploy, allowedHash, contractId };
}

export const AUDIT_DOC_PATH = "v5/simnet/docs/AUDIT.md";

export const PLATFORM_CONTRACTS = {
  stackspots: IDS.stackspots,
  admin: ADMIN,
  trait: `${DEPLOYER_ADDRESS}.stackspot-trait`,
} as const;
