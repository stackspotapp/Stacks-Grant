import { useCallback, useEffect, useRef, useState } from "react";
import type { StacksNetwork } from "@stacks/network";
import type { RegisteredPot } from "../lib/events";
import { fetchPotLiveState, type PotLiveState } from "../lib/potDetails";
import { IDS } from "../config/contracts";

const POLL_INTERVAL_MS = 12_000;

export function useLivePotPolling(
  pots: RegisteredPot[],
  network: StacksNetwork,
  apiOnline: boolean,
  userAddress: string | null,
) {
  const [liveByPot, setLiveByPot] = useState<Record<string, PotLiveState>>({});
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [lastLiveRefresh, setLastLiveRefresh] = useState<Date | null>(null);
  const potsRef = useRef(pots);
  potsRef.current = pots;

  const refreshLive = useCallback(async () => {
    const current = potsRef.current;
    if (current.length === 0) return;

    const sender =
      userAddress ?? current[0]?.potOwner ?? IDS.deployer;

    setLiveRefreshing(true);
    try {
      const entries = await Promise.all(
        current.map(async (pot) => {
          const live = await fetchPotLiveState(pot, sender, network);
          return [pot.potAddress, { ...live, fetchedAt: Date.now() }] as const;
        }),
      );
      setLiveByPot(Object.fromEntries(entries));
      setLastLiveRefresh(new Date());
    } finally {
      setLiveRefreshing(false);
    }
  }, [userAddress, network]);

  const potKey = pots.map((p) => p.potAddress).join(",");

  useEffect(() => {
    if (!apiOnline || pots.length === 0) return;

    void refreshLive();
    const id = setInterval(() => void refreshLive(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [apiOnline, potKey, refreshLive, pots.length]);

  return { liveByPot, liveRefreshing, lastLiveRefresh, refreshLive };
}
