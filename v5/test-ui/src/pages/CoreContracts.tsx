import { useEffect, useState } from "react";
import { Card } from "../components/Card";
import { FunctionExecutor } from "../components/FunctionExecutor";
import { CORE_CONTRACTS, IDS } from "../config/contracts";
import { registerPotArgs } from "../lib/args";
import { useContractAction } from "../hooks/useContractAction";
import { useApp } from "../context/AppContext";
import { ActionButton } from "../components/ActionButton";
import { poolPoxAddressTuple } from "../lib/args";

export function CoreContracts() {
  const { userAddress, isWalletConnected } = useApp();
  const { write } = useContractAction();
  const [selected, setSelected] = useState<string>(CORE_CONTRACTS[0]!.id);
  const [registerForm, setRegisterForm] = useState({
    owner: "",
    contract: "",
    cycles: "1",
    type: "stackspot-sequential-pot",
    potRewardToken: "sbtc",
    minAmount: "100000",
    maxParticipants: "100",
  });

  useEffect(() => {
    if (userAddress) {
      setRegisterForm((f) => ({ ...f, owner: userAddress }));
    }
  }, [userAddress]);

  return (
    <div className="space-y-6">
      <Card
        title="Core platform contracts"
        description="Stackspots, distribute, PoX pool, sBTC, admin — all public functions via wallet"
      >
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mb-4 w-full rounded-lg border border-[var(--color-border)] bg-black/20 px-2 py-2 text-sm text-white"
        >
          {CORE_CONTRACTS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} — {c.id}
            </option>
          ))}
        </select>
        <FunctionExecutor contractId={selected} filterAccess="all" />
      </Card>

      {selected === IDS.stackspots && (
        <Card
          title="Register pot (shortcut)"
          description="Calls stackspots.register-pot with your connected wallet as owner"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(registerForm) as (keyof typeof registerForm)[]).map(
              (key) => (
                <label key={key} className="text-xs">
                  <span className="text-[var(--color-muted)]">{key}</span>
                  <input
                    className="mt-1 w-full rounded border border-[var(--color-border)] bg-black/20 px-2 py-1 font-mono text-sm"
                    value={registerForm[key]}
                    onChange={(e) =>
                      setRegisterForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                  />
                </label>
              ),
            )}
          </div>
          <ActionButton
            className="mt-3"
            disabled={!isWalletConnected}
            onClick={() =>
              void write(
                IDS.stackspots,
                "register-pot",
                registerPotArgs(registerForm),
              )
            }
          >
            register-pot
          </ActionButton>
        </Card>
      )}

      {selected === IDS.pool && (
        <Card title="Pool shortcut">
          <ActionButton
            disabled={!isWalletConnected}
            onClick={() =>
              void write(IDS.pool, "set-pool-pox-address-active", [
                poolPoxAddressTuple(),
              ])
            }
          >
            set-pool-pox-address-active
          </ActionButton>
        </Card>
      )}
    </div>
  );
}
