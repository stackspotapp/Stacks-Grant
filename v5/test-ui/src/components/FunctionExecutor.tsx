import { useEffect, useState } from "react";
import type { ClarityValue } from "@stacks/transactions";
import { useContractAction } from "../hooks/useContractAction";
import { fetchContractInterface, type ContractInterface } from "../lib/stacks";
import { parseContractId } from "../config/contracts";
import { abiTypeIncludes, formatAbiType } from "../lib/abiTypes";
import { parseArgInput } from "../lib/args";
import type { RegisteredPot } from "../lib/events";
import {
  buildPostConditions,
  defaultPostConditionsState,
  type PostConditionsState,
} from "../lib/postConditions";
import { walletErrorMessage } from "../lib/walletErrors";
import { ActionButton } from "./ActionButton";
import { PostConditionsPanel } from "./PostConditionsPanel";
import { ResultBox } from "./ResultBox";
import { useApp } from "../context/AppContext";
import { Eye, Send } from "lucide-react";

type Props = {
  contractId: string;
  pot?: RegisteredPot;
  filterAccess?: "read_only" | "public" | "all";
  showPostConditions?: boolean;
};

export function FunctionExecutor({
  contractId,
  pot,
  filterAccess = "all",
  showPostConditions = false,
}: Props) {
  const { isWalletConnected } = useApp();
  const { read, write, loading, lastResult } = useContractAction();
  const [iface, setIface] = useState<ContractInterface | null>(null);
  const [fnName, setFnName] = useState("");
  const [argInputs, setArgInputs] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [postConditions, setPostConditions] = useState<PostConditionsState>(
    defaultPostConditionsState,
  );
  const [executeError, setExecuteError] = useState<string | null>(null);

  useEffect(() => {
    const { address, name } = parseContractId(contractId);
    setLoadError(null);
    setExecuteError(null);
    setPostConditions(defaultPostConditionsState());
    void fetchContractInterface(address, name).then((i) => {
      if (!i) setLoadError("Contract not deployed or API unreachable");
      setIface(i);
      setFnName("");
    });
  }, [contractId]);

  const functions = (iface?.functions ?? []).filter((f) => {
    if (filterAccess === "all") return true;
    const access = f.access.replace("-", "_");
    return access === filterAccess;
  });

  const fn = functions.find((f) => f.name === fnName);

  useEffect(() => {
    if (fn) {
      setArgInputs(
        fn.args.map((a) => {
          if (abiTypeIncludes(a.type, "trait") && pot) return "pot-trait";
          return "";
        }),
      );
    }
  }, [fn, pot]);

  const buildArgs = (): ClarityValue[] => {
    if (!fn) return [];
    return fn.args.map((a, i) =>
      parseArgInput(a.type, argInputs[i] ?? "", { pot }),
    );
  };

  const handleExecute = async () => {
    if (!fn) return;
    setExecuteError(null);
    try {
      const writeOptions = showPostConditions
        ? {
            postConditionMode: postConditions.mode,
            ...(postConditions.drafts.length > 0
              ? { postConditions: buildPostConditions(postConditions) }
              : {}),
          }
        : undefined;
      await write(contractId, fn.name, buildArgs(), writeOptions);
    } catch (e) {
      setExecuteError(walletErrorMessage(e));
    }
  };

  return (
    <div className="space-y-3">
      {loadError && (
        <p className="text-sm text-[var(--color-error)]">{loadError}</p>
      )}
      <select
        value={fnName}
        onChange={(e) => setFnName(e.target.value)}
        className="w-full rounded-lg border border-[var(--color-border)] bg-black/20 px-2 py-2 text-sm text-white"
      >
        <option value="">Select function…</option>
        {functions.map((f) => (
          <option key={f.name} value={f.name}>
            {f.access} — {f.name}
          </option>
        ))}
      </select>

      {fn && fn.args.length > 0 && (
        <div className="space-y-2">
          {fn.args.map((arg, i) => (
            <div key={arg.name}>
              <label className="text-xs text-[var(--color-muted)]">
                {arg.name}{" "}
                <span className="font-mono text-[10px]">
                  ({formatAbiType(arg.type)})
                </span>
              </label>
              <input
                type="text"
                value={argInputs[i] ?? ""}
                onChange={(e) => {
                  const next = [...argInputs];
                  next[i] = e.target.value;
                  setArgInputs(next);
                }}
                placeholder={
                  abiTypeIncludes(arg.type, "trait") ? "pot-trait" : "value"
                }
                className="mt-1 w-full rounded border border-[var(--color-border)] bg-black/20 px-2 py-1 font-mono text-sm"
              />
            </div>
          ))}
          <p className="text-[10px] text-[var(--color-muted)]">
            Trait args: use <code>pot-trait</code> for this pot. Deployer refs:{" "}
            <code>.stackspots</code>, <code>.sbtc-token</code>.
          </p>
        </div>
      )}

      {fn && showPostConditions && fn.access === "public" && (
        <PostConditionsPanel
          value={postConditions}
          onChange={setPostConditions}
        />
      )}

      {fn && (
        <div className="flex flex-wrap gap-2">
          {(fn.access === "read_only" || fn.access === "read-only") && (
            <ActionButton
              variant="secondary"
              loading={loading}
              onClick={() => void read(contractId, fn.name, buildArgs())}
            >
              <Eye size={14} />
              Read
            </ActionButton>
          )}
          {fn.access === "public" && (
            <ActionButton
              loading={loading}
              disabled={!isWalletConnected}
              onClick={() => void handleExecute()}
            >
              <Send size={14} />
              Execute
            </ActionButton>
          )}
        </div>
      )}

      {executeError && (
        <p className="text-sm text-[var(--color-error)]">{executeError}</p>
      )}

      {!isWalletConnected && fn?.access === "public" && (
        <p className="text-xs text-amber-400">Connect wallet to execute public functions.</p>
      )}

      {lastResult !== null && <ResultBox data={lastResult} />}
    </div>
  );
}
