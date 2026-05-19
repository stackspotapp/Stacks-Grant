import { useCallback, useState } from "react";
import type { ClarityValue, PostCondition, PostConditionModeName } from "@stacks/transactions";
import { parseContractId } from "../config/contracts";
import { useApp } from "../context/AppContext";
import { formatClarityJson, safeJsonStringify } from "../lib/clarityDisplay";
import { callReadOnly } from "../lib/stacks";
import { walletCallContract } from "../lib/wallet";
import { walletErrorMessage } from "../lib/walletErrors";
import { STACKS_API_URL } from "../config/network";

async function waitForTx(txid: string, maxAttempts = 60): Promise<unknown> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${STACKS_API_URL}/extended/v1/tx/${txid}`);
    if (res.ok) {
      const data = await res.json();
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

export type WriteOptions = {
  postConditionMode?: PostConditionModeName;
  postConditions?: PostCondition[];
};

export function useContractAction() {
  const { network, appendLog, userAddress } = useApp();
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<unknown>(null);

  const read = useCallback(
    async (
      contractId: string,
      functionName: string,
      functionArgs: ClarityValue[] = [],
      senderAddress?: string,
    ) => {
      setLoading(true);
      try {
        const { address, name } = parseContractId(contractId);
        const result = await callReadOnly({
          contractAddress: address,
          contractName: name,
          functionName,
          functionArgs,
          senderAddress: senderAddress ?? userAddress ?? address,
          network,
        });
        setLastResult(result);
        appendLog({
          label: `read ${functionName}`,
          status: "success",
          detail: formatClarityJson(result),
        });
        return result;
      } catch (e) {
        appendLog({
          label: `read ${functionName}`,
          status: "error",
          detail: walletErrorMessage(e),
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [network, appendLog, userAddress],
  );

  const write = useCallback(
    async (
      contractId: string,
      functionName: string,
      functionArgs: ClarityValue[],
      options?: WriteOptions,
    ) => {
      if (!userAddress) {
        throw new Error(
          "Connect your wallet from the sidebar before executing public functions",
        );
      }
      setLoading(true);
      try {
        const txid = await walletCallContract({
          contractId,
          functionName,
          functionArgs,
          senderAddress: userAddress,
          postConditionMode: options?.postConditionMode,
          postConditions: options?.postConditions,
          onBeforeRequest: (payload) => {
            appendLog({
              label: `${functionName} (pre-sign)`,
              status: "pending",
              detail: safeJsonStringify(payload, 2),
            });
            appendLog({
              label: functionName,
              status: "pending",
              detail: "Awaiting wallet approval…",
            });
          },
        });
        const receipt = await waitForTx(txid);
        const out = { txid, receipt };
        setLastResult(out);
        appendLog({
          label: functionName,
          status:
            (receipt as { tx_status?: string }).tx_status === "success"
              ? "success"
              : "error",
          detail: safeJsonStringify(out, 2),
        });
        return out;
      } catch (e) {
        appendLog({
          label: functionName,
          status: "error",
          detail: walletErrorMessage(e),
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [userAddress, appendLog],
  );

  return { read, write, loading, lastResult, setLastResult };
}
