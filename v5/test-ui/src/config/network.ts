import { STACKS_DEVNET, type StacksNetwork } from "@stacks/network";

export const STACKS_API_URL =
  import.meta.env.VITE_STACKS_API_URL ?? "http://localhost:3999";

export const DEPLOYER_ADDRESS =
  import.meta.env.VITE_DEPLOYER_ADDRESS ??
  "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";

export function createNetwork(): StacksNetwork {
  return {
    ...STACKS_DEVNET,
    client: { baseUrl: STACKS_API_URL },
  };
}

export type ChainInfo = {
  network: string;
  burn_block_height: number;
  stacks_tip_height: number;
};

export async function fetchChainInfo(): Promise<ChainInfo | null> {
  try {
    const res = await fetch(`${STACKS_API_URL}/v2/info`);
    if (!res.ok) return null;
    return (await res.json()) as ChainInfo;
  } catch {
    return null;
  }
}
