import { useCallback, useEffect, useState } from "react";
import type { StacksNetwork } from "@stacks/network";
import { fetchPoxInfo, type PoxInfo } from "../lib/poxInfo";
import { IDS } from "../config/contracts";

export function usePoxInfo(
  network: StacksNetwork,
  apiOnline: boolean,
  senderAddress: string | null,
) {
  const [poxInfo, setPoxInfo] = useState<PoxInfo | null>(null);
  const [poxError, setPoxError] = useState<string | null>(null);

  const refreshPox = useCallback(async () => {
    const sender = senderAddress ?? IDS.deployer;
    try {
      const info = await fetchPoxInfo(network, sender);
      setPoxInfo(info);
      setPoxError(info ? null : "get-pox-info returned no data");
    } catch (e) {
      setPoxInfo(null);
      setPoxError(e instanceof Error ? e.message : String(e));
    }
  }, [network, senderAddress]);

  useEffect(() => {
    if (!apiOnline) return;
    void refreshPox();
    const id = setInterval(() => void refreshPox(), 30_000);
    return () => clearInterval(id);
  }, [apiOnline, refreshPox]);

  return { poxInfo, poxError, refreshPox };
}
