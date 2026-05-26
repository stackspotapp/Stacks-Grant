import {
  type ClarityValue,
  PostConditionMode,
  broadcastTransaction,
  cvToJSON,
  fetchCallReadOnlyFunction,
  makeContractCall,
} from "@stacks/transactions";
import type { StacksNetwork } from "@stacks/network";

export type ReadCallParams = {
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: ClarityValue[];
  senderAddress: string;
  network: StacksNetwork;
};

export async function callReadOnly(params: ReadCallParams) {
  const result = await fetchCallReadOnlyFunction({
    ...params,
  });
  return cvToJSON(result);
}

export type WriteCallParams = ReadCallParams & {
  senderKey: string;
  fee?: number;
};

type TxReceipt = {
  tx_status: string;
  tx_result?: { repr: string; hex: string };
};

async function waitForTx(
  txid: string,
  network: StacksNetwork,
  maxAttempts = 60,
): Promise<TxReceipt> {
  const base = network.client.baseUrl;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${base}/extended/v1/tx/${txid}`);
    if (res.ok) {
      const data = (await res.json()) as TxReceipt;
      if (
        data.tx_status === "success" ||
        data.tx_status === "abort_by_response" ||
        data.tx_status === "abort_by_post_condition"
      ) {
        return data;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Transaction ${txid} not confirmed in time`);
}

export async function callPublic(params: WriteCallParams) {
  const tx = await makeContractCall({
    contractAddress: params.contractAddress,
    contractName: params.contractName,
    functionName: params.functionName,
    functionArgs: params.functionArgs,
    senderKey: params.senderKey,
    network: params.network,
    postConditionMode: PostConditionMode.Deny,
    fee: params.fee ?? 50_000,
  });

  const broadcast = await broadcastTransaction({
    transaction: tx,
    network: params.network,
  });

  if ("error" in broadcast) {
    throw new Error(`${broadcast.error}: ${broadcast.reason}`);
  }

  const receipt = await waitForTx(broadcast.txid, params.network);

  return {
    txid: broadcast.txid,
    receipt,
    result: receipt.tx_result?.repr ?? null,
  };
}

export async function fetchStxBalance(address: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_STACKS_API_URL ?? "http://localhost:3999"}/extended/v1/address/${address}/stx`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { balance: string };
    return Number(data.balance);
  } catch {
    return null;
  }
}

export type ContractInterface = {
  functions: Array<{
    name: string;
    access: string;
    args: Array<{ name: string; type: unknown }>;
    outputs: { type: unknown };
  }>;
};

export async function fetchContractInterface(
  address: string,
  name: string,
): Promise<ContractInterface | null> {
  try {
    const base = import.meta.env.VITE_STACKS_API_URL ?? "http://localhost:3999";
    const res = await fetch(`${base}/v2/contracts/interface/${address}/${name}`);
    if (!res.ok) return null;
    return (await res.json()) as ContractInterface;
  } catch {
    return null;
  }
}

export async function isContractDeployed(
  address: string,
  name: string,
): Promise<boolean> {
  const iface = await fetchContractInterface(address, name);
  return iface !== null && (iface.functions?.length ?? 0) > 0;
}

function microToDisplayAmount(micro: number | string | bigint): number | null {
  const n =
    typeof micro === "bigint"
      ? Number(micro)
      : typeof micro === "string"
        ? Number(micro)
        : micro;
  return Number.isFinite(n) ? n : null;
}

/** Display label for a pot reward token (e.g. registration `pot-reward-token`). */
export function rewardTokenSymbol(rewardToken: string): string {
  if (rewardToken.toLowerCase().includes("sbtc")) return "sBTC";
  return "STX";
}

export function formatMicroAmount(
  micro: number | string | bigint,
  unit: string,
): string {
  const n = microToDisplayAmount(micro);
  if (n === null) return `— ${unit}`;
  return `${(n / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${unit}`;
}

export function formatMicroStx(micro: number | string | bigint): string {
  return formatMicroAmount(micro, "STX");
}

/** Shorten a principal for compact UI (full value in title). */
export function shortPrincipal(principal: string, head = 8, tail = 6): string {
  if (principal.length <= head + tail + 3) return principal;
  return `${principal.slice(0, head)}…${principal.slice(-tail)}`;
}
