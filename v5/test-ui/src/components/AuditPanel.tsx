import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { PotTemplate } from "../config/potManifest";
import type { DeployAuditStatus } from "../lib/audit";

export function AuditPanel({
  template,
  sourceSha256,
  lineCount,
  onChain,
  sourceModified,
}: {
  template: PotTemplate;
  sourceSha256: string;
  lineCount: number;
  onChain?: DeployAuditStatus | null;
  sourceModified?: boolean;
}) {
  const verdictColor =
    template.auditVerdict === "CRITICAL_FAIL"
      ? "text-red-400"
      : template.auditVerdict === "FAIL"
        ? "text-amber-400"
        : "text-yellow-300";

  return (
    <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-black/20 p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className={`mt-0.5 shrink-0 ${verdictColor}`} size={22} />
        <div>
          <h3 className="font-semibold text-white">Audit disclosure</h3>
          <p className="text-sm text-[var(--color-muted)]">
            Review source below before deploying. Full report:{" "}
            <code className="text-xs">v5/simnet/docs/AUDIT.md</code>
          </p>
        </div>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--color-muted)]">Audit verdict</dt>
          <dd className={verdictColor}>
            {template.auditVerdict} ({template.auditRisk})
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Source lines</dt>
          <dd>{lineCount.toLocaleString()}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[var(--color-muted)]">Source SHA-256 (UTF-8)</dt>
          <dd className="break-all font-mono text-[10px] text-slate-300">
            {sourceSha256}
          </dd>
          <p className="mt-1 text-[10px] text-[var(--color-muted)]">
            Fingerprint for off-chain audit logs. On-chain registration uses
            Clarity <code>contract-hash?</code>, checked via admin allowlist after deploy.
          </p>
          {sourceModified && (
            <p className="mt-2 text-xs text-amber-400">
              Source differs from the bundled template — SHA-256 and on-chain{" "}
              <code>contract-hash?</code> will not match the pre-audited template.
              An admin must allowlist your deployed contract before{" "}
              <code>register-pot</code>.
            </p>
          )}
        </div>
      </dl>

      <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
        {template.auditFindings.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      {onChain && (
        <div className="border-t border-[var(--color-border)] pt-3">
          <p className="mb-2 text-xs font-medium text-white">On-chain checks</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <StatusChip
              label="can-deploy-pot"
              value={onChain.canDeploy}
            />
            <StatusChip
              label="is-contract-allowed-hash"
              value={onChain.allowedHash}
            />
          </div>
          <p className="mt-2 font-mono text-[10px] text-[var(--color-muted)]">
            {onChain.contractId}
          </p>
          {onChain.allowedHash === false && (
            <p className="mt-2 text-xs text-amber-400">
              Hash not allowlisted — an admin must call{" "}
              <code>set-pot-contract-hash</code> on stackspot-admin before{" "}
              <code>register-pot</code> will succeed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusChip({
  label,
  value,
}: {
  label: string;
  value: boolean | null;
}) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--color-muted)]">
        <ShieldQuestion size={14} /> {label}: unknown
      </span>
    );
  }
  if (value) {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--color-success)]">
        <ShieldCheck size={14} /> {label}: yes
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[var(--color-error)]">
      <ShieldAlert size={14} /> {label}: no
    </span>
  );
}
