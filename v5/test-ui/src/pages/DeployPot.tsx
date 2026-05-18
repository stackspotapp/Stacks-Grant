import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileCode2, Rocket } from "lucide-react";
import { Card } from "../components/Card";
import { ActionButton } from "../components/ActionButton";
import { SourceEditor } from "../components/SourceEditor";
import { AuditPanel } from "../components/AuditPanel";
import { useApp } from "../context/AppContext";
import {
  POT_TEMPLATES,
  getPotTemplate,
  type PotTemplateId,
} from "../config/potManifest";
import { sha256HexUtf8, validateContractName, countSourceLines } from "../lib/sourceAudit";
import { fetchDeployAuditStatus, type DeployAuditStatus } from "../lib/audit";
import { walletDeployContract } from "../lib/wallet";
import { STACKS_API_URL } from "../config/network";
import { parseContractId } from "../config/contracts";
import { walletErrorMessage } from "../lib/walletErrors";

export function DeployPot() {
  const { userAddress, isWalletConnected, network, appendLog } = useApp();
  const [templateId, setTemplateId] = useState<PotTemplateId>(
    "stackspot-sequential-pot",
  );
  const [contractName, setContractName] = useState("");
  const [sourceSha256, setSourceSha256] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [lastTxid, setLastTxid] = useState<string | null>(null);
  const [deployedContractId, setDeployedContractId] = useState<string | null>(
    null,
  );
  const [onChainAudit, setOnChainAudit] = useState<DeployAuditStatus | null>(
    null,
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");

  const template = useMemo(() => getPotTemplate(templateId), [templateId]);
  const isSourceModified = sourceDraft !== template.source;
  const lineCount = useMemo(() => countSourceLines(sourceDraft), [sourceDraft]);
  const nameError = validateContractName(contractName);

  useEffect(() => {
    setContractName(template.defaultContractName);
    setSourceDraft(template.source);
    setAcknowledged(false);
    setLastTxid(null);
    setDeployedContractId(null);
    setOnChainAudit(null);
  }, [templateId, template.defaultContractName, template.source]);

  useEffect(() => {
    if (!sourceDraft) return;
    void sha256HexUtf8(sourceDraft).then(setSourceSha256);
  }, [sourceDraft]);

  const refreshOnChain = useCallback(
    async (contractId: string) => {
      if (!userAddress) return;
      const status = await fetchDeployAuditStatus(contractId, userAddress, network);
      setOnChainAudit(status);
    },
    [userAddress, network],
  );

  useEffect(() => {
    if (deployedContractId && userAddress) {
      void refreshOnChain(deployedContractId);
    }
  }, [deployedContractId, userAddress, refreshOnChain]);

  const deploy = async () => {
    if (!userAddress) return;
    if (nameError) return;
    if (!acknowledged) return;

    setDeploying(true);
    try {
      appendLog({
        label: `deploy ${contractName}`,
        status: "pending",
        detail: "Awaiting wallet approval for contract publish…",
      });

      const txid = await walletDeployContract({
        name: contractName,
        clarityCode: sourceDraft,
        clarityVersion: template.clarityVersion,
        senderAddress: userAddress,
      });

      const contractId = `${userAddress}.${contractName}`;
      setLastTxid(txid);
      setDeployedContractId(contractId);

      appendLog({
        label: `deploy ${contractName}`,
        status: "success",
        detail: JSON.stringify({ txid, contractId }, null, 2),
      });

      await refreshOnChain(contractId);
    } catch (e) {
      appendLog({
        label: `deploy ${contractName}`,
        status: "error",
        detail: walletErrorMessage(e),
      });
    } finally {
      setDeploying(false);
    }
  };

  const potRoute = deployedContractId
    ? (() => {
        const { address, name } = parseContractId(deployedContractId);
        return `/pot/${encodeURIComponent(address)}/${encodeURIComponent(name)}`;
      })()
    : null;

  return (
    <div className="space-y-6">
      <Card
        title="Deploy pot contract"
        description="Authenticated users publish audited Clarity templates from v5/simnet via Stacks Connect."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-[var(--color-muted)]">Pot template</span>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value as PotTemplateId)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-black/20 px-2 py-2 text-white"
            >
              {POT_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {template.description}
            </p>
          </label>

          <label className="text-sm">
            <span className="text-[var(--color-muted)]">Contract name</span>
            <input
              value={contractName}
              onChange={(e) => setContractName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-black/20 px-2 py-2 font-mono text-sm"
              placeholder="my-sequential-pot-01"
            />
            {nameError && (
              <p className="mt-1 text-xs text-[var(--color-error)]">{nameError}</p>
            )}
            {userAddress && !nameError && (
              <p className="mt-1 font-mono text-[10px] text-[var(--color-muted)]">
                Will deploy as {userAddress}.{contractName}
              </p>
            )}
          </label>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1"
          />
          <span>
            I have reviewed the source below (including any edits) and the audit
            notes. I understand devnet deployments are for testing, that AUDIT.md
            reports open findings on the templates, and that changing source updates
            the on-chain contract hash allowlist requirement.
          </span>
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton
            loading={deploying}
            disabled={
              !isWalletConnected ||
              !acknowledged ||
              Boolean(nameError) ||
              !contractName.trim()
            }
            onClick={() => void deploy()}
          >
            <Rocket size={14} />
            Deploy via wallet
          </ActionButton>
          {deployedContractId && (
            <ActionButton
              variant="secondary"
              onClick={() => void refreshOnChain(deployedContractId)}
            >
              Re-check allowlist
            </ActionButton>
          )}
        </div>

        {!isWalletConnected && (
          <p className="mt-2 text-xs text-amber-400">
            Connect your wallet in the sidebar to deploy.
          </p>
        )}

        {lastTxid && (
          <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-black/20 p-3 text-sm">
            <p>
              <span className="text-[var(--color-muted)]">Tx: </span>
              <a
                className="font-mono text-xs text-[var(--color-accent)] hover:underline"
                href={`${STACKS_API_URL}/extended/v1/tx/${lastTxid}`}
                target="_blank"
                rel="noreferrer"
              >
                {lastTxid}
              </a>
            </p>
            {deployedContractId && (
              <p className="mt-2 font-mono text-xs">{deployedContractId}</p>
            )}
            {potRoute && (
              <p className="mt-2">
                <Link to={potRoute} className="text-[var(--color-accent)] hover:underline">
                  Open pot → init / join / start
                </Link>
                {" · "}
                <Link to="/core" className="text-[var(--color-accent)] hover:underline">
                  Register on stackspots
                </Link>
              </p>
            )}
          </div>
        )}
      </Card>

      {sourceSha256 && (
        <AuditPanel
          template={template}
          sourceSha256={sourceSha256}
          lineCount={lineCount}
          onChain={onChainAudit}
          sourceModified={isSourceModified}
        />
      )}

      <Card
        title="Source code"
        description="Edit before deploy — exact bytes sent to stx_deployContract"
        actions={<FileCode2 size={18} className="text-[var(--color-muted)]" />}
      >
        <SourceEditor
          source={sourceDraft}
          sourcePath={template.sourcePath}
          onChange={setSourceDraft}
          onReset={() => setSourceDraft(template.source)}
          isModified={isSourceModified}
        />
      </Card>

      <Card title="After deploy">
        <ol className="list-inside list-decimal space-y-2 text-sm text-slate-300">
          <li>
            Wait for confirmation, then open the pot page and call{" "}
            <code>init-pot</code> (type hint:{" "}
            <code>{template.registerTypeHint}</code>).
          </li>
          <li>
            Ensure <code>stackspot-admin.is-contract-allowed-hash</code> is true
            (admin <code>set-pot-contract-hash</code> if needed).
          </li>
          <li>
            Activate pool on Core → Multi-pool, then{" "}
            <code>register-pot</code> on stackspots.
          </li>
        </ol>
      </Card>
    </div>
  );
}
