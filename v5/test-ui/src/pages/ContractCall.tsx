import { useCallback, useEffect, useState } from "react";
import { Card } from "../components/Card";
import { FunctionExecutor } from "../components/FunctionExecutor";
import { ActionButton } from "../components/ActionButton";
import { CONTRACTS, contractId, parseContractId } from "../config/contracts";
import { isContractDeployed } from "../lib/stacks";

export function ContractCall() {
  const unique = CONTRACTS.filter(
    (c, i, arr) =>
      arr.findIndex((x) => x.address === c.address && x.name === c.name) === i,
  );
  const initialPreset = contractId(
    unique[0]!.address,
    unique[0]!.name,
  );

  const [contractInput, setContractInput] = useState(initialPreset);
  const [resolvedId, setResolvedId] = useState<string | null>(initialPreset);
  const [parseError, setParseError] = useState<string | null>(null);
  const [deployed, setDeployed] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const loadContract = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      setParseError("Enter a contract id (address.name)");
      setResolvedId(null);
      setDeployed(null);
      return;
    }

    setChecking(true);
    try {
      const { address, name } = parseContractId(trimmed);
      const id = contractId(address, name);
      setParseError(null);
      setResolvedId(id);
      const ok = await isContractDeployed(address, name);
      setDeployed(ok);
      if (!ok) {
        setParseError("Contract not deployed or API unreachable");
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid contract id");
      setResolvedId(null);
      setDeployed(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void loadContract(initialPreset);
  }, [initialPreset, loadContract]);

  return (
    <div className="space-y-6">
      <Card
        title="Contract call"
        description="Target any deployed contract by principal, load its public API, and attach post conditions before signing"
      >
        <label className="text-xs text-[var(--color-muted)]">
          Contract id
          <input
            type="text"
            value={contractInput}
            onChange={(e) => setContractInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void loadContract(contractInput);
            }}
            placeholder="ST1PQH….my-contract"
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-black/20 px-2 py-2 font-mono text-xs text-white"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-[12rem] flex-1 text-xs text-[var(--color-muted)]">
            Manifest preset
            <select
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                setContractInput(id);
                void loadContract(id);
              }}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-black/20 px-2 py-2 font-mono text-xs text-white"
            >
              <option value="">Load from manifest…</option>
              {unique.map((c) => {
                const id = contractId(c.address, c.name);
                return (
                  <option key={id} value={id}>
                    {c.label ? `[${c.label}] ` : ""}
                    {id}
                  </option>
                );
              })}
            </select>
          </label>
          <ActionButton
            loading={checking}
            onClick={() => void loadContract(contractInput)}
          >
            Load contract
          </ActionButton>
        </div>

        {parseError && (
          <p className="mt-2 text-sm text-[var(--color-error)]">{parseError}</p>
        )}
        {resolvedId && deployed && (
          <p className="mt-2 text-xs text-[var(--color-success)]">
            Loaded {resolvedId}
          </p>
        )}
      </Card>

      {resolvedId && deployed && (
        <Card
          title="Call function"
          description="Select a function, fill arguments, configure post conditions, then execute via your connected wallet"
        >
          <FunctionExecutor
            contractId={resolvedId}
            filterAccess="all"
            showPostConditions
          />
        </Card>
      )}
    </div>
  );
}
