import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card } from "../components/Card";
import { ActionButton } from "../components/ActionButton";
import { PotCard } from "../components/PotCard";
import { STACKS_API_URL } from "../config/network";
import { fetchRegisteredPots, type RegisteredPot } from "../lib/events";
import { useLivePotPolling } from "../hooks/useLivePotPolling";
import { usePoxInfo } from "../hooks/usePoxInfo";

export function Dashboard() {
  const { apiOnline, chainInfo, refreshChain, userAddress, network } = useApp();
  const { poxInfo } = usePoxInfo(network, apiOnline, userAddress);
  const [pots, setPots] = useState<RegisteredPot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { liveByPot, liveRefreshing, lastLiveRefresh, refreshLive } =
    useLivePotPolling(pots, network, apiOnline, userAddress);
  const loadPots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const registered = await fetchRegisteredPots();
      setPots(registered);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (apiOnline) void loadPots();
  }, [apiOnline, loadPots]);

  return (
    <div className="space-y-6">
      <Card
        title="Registered pots"
        description={`From stackspots events · live get-pot-details every 12s · ${STACKS_API_URL}`}
        actions={
          <div className="flex items-center gap-2">
            {lastLiveRefresh && (
              <span className="text-[10px] text-[var(--color-muted)]">
                {liveRefreshing ? "Updating…" : `Live ${lastLiveRefresh.toLocaleTimeString()}`}
              </span>
            )}
            <ActionButton
              variant="secondary"
              loading={loading}
              onClick={() => {
                void refreshChain();
                void loadPots();
                void refreshLive();
              }}
            >
              <RefreshCw size={14} className={liveRefreshing ? "animate-spin" : ""} />
              Refresh
            </ActionButton>
          </div>
        }
      >
        {error && <p className="mb-3 text-sm text-[var(--color-error)]">{error}</p>}
        {!apiOnline && (
          <p className="text-sm text-amber-400">
            Start devnet: <code className="text-xs">cd v5/simnet && clarinet devnet start</code>
          </p>
        )}
        {apiOnline && pots.length === 0 && !loading && (
          <p className="text-sm text-[var(--color-muted)]">
            No pots registered yet. Deploy a pot contract, call{" "}
            <code className="text-xs">init-pot</code>, then{" "}
            <code className="text-xs">register-pot</code> on stackspots (see Core contracts).
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pots.map((pot) => (
            <PotCard
              key={pot.potAddress}
              pot={pot}
              live={liveByPot[pot.potAddress]}
              refreshing={liveRefreshing}
              currentBurnHeight={chainInfo?.burn_block_height}
              poxInfo={poxInfo}
            />
          ))}
        </div>
      </Card>

      {chainInfo && (
        <Card title="Chain">
          <p className="font-mono text-sm text-slate-300">
            burn {chainInfo.burn_block_height} · stacks {chainInfo.stacks_tip_height}
          </p>
        </Card>
      )}
    </div>
  );
}
