import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { CONTRACTS } from "../config/contracts";
import { isContractDeployed } from "../lib/stacks";

type Status = "loading" | "deployed" | "missing";

export function DeployStatus() {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const next: Record<string, Status> = {};
      for (const c of CONTRACTS) {
        const key = `${c.address}.${c.name}`;
        if (next[key] === "deployed") continue;
        const ok = await isContractDeployed(c.address, c.name);
        if (!cancelled) next[key] = ok ? "deployed" : "missing";
      }
      if (!cancelled) setStatuses(next);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const unique = CONTRACTS.filter(
    (c, i, arr) =>
      arr.findIndex((x) => x.address === c.address && x.name === c.name) === i,
  );

  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {unique.map((c) => {
        const key = `${c.address}.${c.name}`;
        const status = statuses[key] ?? "loading";
        return (
          <div
            key={key}
            className="flex items-center gap-2 rounded border border-[var(--color-border)] px-2 py-1 text-xs"
          >
            {status === "loading" && (
              <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-slate-500" />
            )}
            {status === "deployed" && (
              <CheckCircle2 size={14} className="text-[var(--color-success)]" />
            )}
            {status === "missing" && (
              <XCircle size={14} className="text-[var(--color-error)]" />
            )}
            <span className="truncate font-mono text-slate-300">
              {c.label ? `${c.label}/` : ""}
              {c.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
