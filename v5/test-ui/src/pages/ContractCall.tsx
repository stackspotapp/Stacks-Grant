import { useState } from "react";
import { Card } from "../components/Card";
import { FunctionExecutor } from "../components/FunctionExecutor";
import { CONTRACTS, contractId } from "../config/contracts";

export function ContractCall() {
  const [selected, setSelected] = useState(
    contractId(CONTRACTS[0]!.address, CONTRACTS[0]!.name),
  );

  const unique = CONTRACTS.filter(
    (c, i, arr) =>
      arr.findIndex((x) => x.address === c.address && x.name === c.name) === i,
  );

  return (
    <div className="space-y-6">
      <Card
        title="Advanced contract caller"
        description="Pick any deployed contract from the deployment manifest"
      >
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mb-4 w-full rounded-lg border border-[var(--color-border)] bg-black/20 px-2 py-2 font-mono text-xs text-white"
        >
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
        <FunctionExecutor contractId={selected} filterAccess="all" />
      </Card>
    </div>
  );
}
