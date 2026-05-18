import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card } from "../components/Card";
import { FunctionExecutor } from "../components/FunctionExecutor";
import { ResultBox } from "../components/ResultBox";
import { useApp } from "../context/AppContext";
import { fetchRegisteredPots, type RegisteredPot } from "../lib/events";
import { fetchPotLiveState } from "../lib/potDetails";
import { parsePotRouteParams } from "../lib/principal";
import { useContractAction } from "../hooks/useContractAction";

const READ_ONLY_GETTERS = [
  "get-pot-details",
  "get-pot-value",
  "get-pot-participants",
  "get-pot-admin",
  "get-pot-treasury",
  "get-pot-cycle",
  "get-pot-name",
  "get-pot-type",
  "get-pot-min-amount",
  "get-pot-max-participants",
  "get-pool-config",
  "is-locked",
  "validate-can-join-pot",
  "validate-can-claim-pot",
];

export function PotDetail() {
  const { address: addressParam, name: nameParam } = useParams<{
    address: string;
    name: string;
  }>();
  const navigate = useNavigate();
  const { network, userAddress } = useApp();
  const { read, loading } = useContractAction();
  const [registration, setRegistration] = useState<RegisteredPot | null>(null);
  const [live, setLive] = useState<unknown>(null);

  const parsed = useMemo(() => {
    if (!addressParam || !nameParam) return null;
    return parsePotRouteParams(addressParam, nameParam);
  }, [addressParam, nameParam]);

  const { address, name, contractId } = useMemo(() => {
    if (!parsed) {
      return { address: "", name: "", contractId: "" };
    }
    return {
      address: parsed.address,
      name: parsed.name,
      contractId: parsed.full,
    };
  }, [parsed]);

  useEffect(() => {
    if (!parsed || !addressParam || !nameParam) return;
    const rawAddress = decodeURIComponent(addressParam);
    const rawName = decodeURIComponent(nameParam);
    if (rawAddress !== parsed.address || rawName !== parsed.name) {
      navigate(
        `/pot/${encodeURIComponent(parsed.address)}/${encodeURIComponent(parsed.name)}`,
        { replace: true },
      );
    }
  }, [parsed, addressParam, nameParam, navigate]);

  const pot: RegisteredPot | undefined = useMemo(() => {
    if (!address || !name) return undefined;
    return (
      registration ?? {
        potId: 0,
        potAddress: contractId,
        potOwner: "",
        potName: name,
        potType: name,
        potCycles: 0,
        potRewardToken: "",
        potMinAmount: 0,
        potMaxParticipants: 0,
        potDeployFee: 0,
        burnBlockHeight: 0,
        stacksBlockHeight: 0,
        txId: "",
        blockHeight: 0,
        contractAddress: address,
        contractName: name,
      }
    );
  }, [registration, address, name, contractId]);

  useEffect(() => {
    if (!address || !name) return;
    void fetchRegisteredPots().then((all) => {
      const found = all.find(
        (p) => p.contractAddress === address && p.contractName === name,
      );
      setRegistration(found ?? null);
    });
  }, [address, name]);

  useEffect(() => {
    if (!pot || !address || !name) return;
    const sender = userAddress ?? address;
    void fetchPotLiveState(pot, sender, network).then((s) => setLive(s.rawDetails));
  }, [pot, address, name, userAddress, network]);

  if (!parsed || !pot) {
    return (
      <p className="text-[var(--color-error)]">
        Invalid pot URL — expected{" "}
        <code className="text-xs">/pot/ST…deployer/stackspot-jackpot</code>
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-white"
      >
        <ArrowLeft size={16} /> Back to dashboard
      </Link>

      <Card title={pot.potName} description={contractId}>
        {registration && (
          <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--color-muted)]">Pot ID</dt>
              <dd>{registration.potId}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Owner</dt>
              <dd className="truncate font-mono text-xs">{registration.potOwner}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Type</dt>
              <dd>{registration.potType}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Reward token</dt>
              <dd>{registration.potRewardToken}</dd>
            </div>
          </dl>
        )}
        {live != null ? <ResultBox data={live} /> : null}
      </Card>

      <Card
        title="Read-only getters"
        description="Quick refresh of common pot state"
      >
        <div className="flex flex-wrap gap-2">
          {READ_ONLY_GETTERS.map((fn) => (
            <button
              key={fn}
              type="button"
              disabled={loading}
              onClick={() => void read(contractId, fn)}
              className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-white/5"
            >
              {fn}
            </button>
          ))}
        </div>
      </Card>

      <Card
        title="Public functions"
        description="Execute with your connected wallet (Leather, Xverse, etc.)"
      >
        <FunctionExecutor contractId={contractId} pot={pot} filterAccess="public" />
      </Card>

      <Card title="All contract functions" description="Including read-only via ABI">
        <FunctionExecutor contractId={contractId} pot={pot} filterAccess="all" />
      </Card>
    </div>
  );
}
