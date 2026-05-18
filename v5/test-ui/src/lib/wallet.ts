import {
  disconnect,
  getLocalStorage,
  isConnected,
  JsonRpcError,
  JsonRpcErrorCode,
  request,
} from "@stacks/connect";
import {
  Pc,
  serializeCV,
  type ClarityValue,
  type ContractIdString,
  type PostConditionModeName,
} from "@stacks/transactions";
import { safeJsonStringify } from "./clarityDisplay";

const SESSION_STORAGE_KEY = "stackspot-test-ui-wallet-session";

export type WalletSession = {
  address: string;
  /** Present when returned by getAddresses; not required for stx_callContract. */
  publicKey?: string;
};

/** Params for request('stx_callContract', …) — network comes from the wallet. */
export type StxCallContractRequest = {
  contract: ContractIdString;
  functionName: string;
  functionArgs: ClarityValue[];
  address: string;
  postConditionMode: PostConditionModeName;
};

/** Log-safe payload (hex args only — no ClarityValue / bigint). */
export type StxCallContractLogPayload = {
  method: "stx_callContract";
  contract: string;
  functionName: string;
  address: string;
  postConditionMode: PostConditionModeName;
  functionArgsSerialized: string[];
};

export type WalletCallContractParams = {
  contractId: string;
  functionName: string;
  functionArgs: ClarityValue[];
  senderAddress: string;
  onBeforeRequest?: (payload: StxCallContractLogPayload) => void;
};

type AddressEntry = { address: string; publicKey?: string };

function pickStxAddress(
  addresses: AddressEntry[],
  preferred?: string,
): AddressEntry | null {
  const stxAddresses = addresses.filter((a) => a.address?.startsWith("ST"));
  if (preferred) {
    const match = stxAddresses.find((a) => a.address === preferred);
    if (match) return match;
  }
  return stxAddresses[0] ?? null;
}

function persistSession(session: WalletSession) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore quota / private mode */
  }
}

function loadPersistedSession(): WalletSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalletSession;
    if (parsed.address) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function clearPersistedSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Read-only session peek (no wallet RPC). */
export function getCachedSession(): WalletSession | null {
  const persisted = loadPersistedSession();
  if (persisted) return persisted;

  if (!isConnected()) return null;
  const data = getLocalStorage();
  const stx = data?.addresses?.stx?.[0] as AddressEntry | undefined;
  if (!stx?.address) return null;
  return { address: stx.address, publicKey: stx.publicKey };
}

/**
 * Connect once from the sidebar via request('getAddresses').
 * Network is derived from the wallet — do not pass network in params.
 */
export async function connectWallet(): Promise<WalletSession> {
  const persisted = loadPersistedSession();
  if (persisted && isConnected()) {
    return persisted;
  }

  const result = isConnected()
    ? await request("getAddresses")
    : await request({ forceWalletSelect: true }, "getAddresses");

  const stx = pickStxAddress((result.addresses ?? []) as AddressEntry[]);
  if (!stx?.address) {
    throw new Error(
      "Wallet did not return an STX address. Point Leather at your devnet API (e.g. http://localhost:3999).",
    );
  }
  const session: WalletSession = {
    address: stx.address,
    publicKey: stx.publicKey,
  };
  persistSession(session);
  return session;
}

export function disconnectWallet() {
  clearPersistedSession();
  disconnect();
}

function buildCallContractRequest(
  params: Pick<
    WalletCallContractParams,
    "contractId" | "functionName" | "functionArgs" | "senderAddress"
  >,
): StxCallContractRequest {
  return {
    contract: params.contractId as ContractIdString,
    functionName: params.functionName,
    functionArgs: params.functionArgs,
    address: params.senderAddress,
    postConditionMode: "allow" as PostConditionModeName,
  };
}

/** Contract call via request('stx_callContract') — wallet supplies network. */
export async function walletCallContract(
  params: WalletCallContractParams,
): Promise<string> {
  const requestParams = buildCallContractRequest(params);
  const functionArgsSerialized = requestParams.functionArgs.map((cv) =>
    serializeCV(cv),
  );

  const logPayload: StxCallContractLogPayload = {
    method: "stx_callContract",
    contract: requestParams.contract,
    functionName: requestParams.functionName,
    address: requestParams.address,
    postConditionMode: requestParams.postConditionMode,
    functionArgsSerialized,
  };

  console.log("[wallet] stx_callContract", safeJsonStringify(logPayload, 2));
  params.onBeforeRequest?.(logPayload);

  const response = await request("stx_callContract", requestParams);

  if (!response?.txid) {
    throw new Error("Wallet did not return a transaction id");
  }
  return response.txid;
}

export async function walletDeployContract(params: {
  name: string;
  clarityCode: string;
  clarityVersion?: number;
  senderAddress?: string;
}): Promise<string> {
  const deployParams = {
    name: params.name,
    clarityCode: params.clarityCode,
    clarityVersion: params.clarityVersion ?? 3,
    postConditionMode: "deny" as PostConditionModeName,
    postConditions: [Pc.origin().willSendLte(100000).ustx()],
    ...(params.senderAddress ? { address: params.senderAddress } : {}),
  };

  console.log("[wallet] stx_deployContract", safeJsonStringify(deployParams, 2));

  const response = await request("stx_deployContract", deployParams);

  if (!response?.txid) {
    throw new Error("Wallet did not return a transaction id");
  }
  return response.txid;
}

export { JsonRpcError, JsonRpcErrorCode };
