import sequentialSource from "../../../simnet/contracts/stackspot-sequential-pot.clar?raw";
import jackpotSource from "../../../simnet/contracts/stackspot-jackpot.clar?raw";
import crowdfundSource from "../../../simnet/contracts/stackspot-crowdfund.clar?raw";

export type PotTemplateId =
  | "stackspot-sequential-pot"
  | "stackspot-jackpot"
  | "stackspot-crowdfund";

export type PotTemplate = {
  id: PotTemplateId;
  label: string;
  description: string;
  defaultContractName: string;
  sourcePath: string;
  source: string;
  clarityVersion: number;
  auditVerdict: "CRITICAL_FAIL" | "FAIL" | "CONDITIONAL_PASS";
  auditRisk: string;
  auditFindings: string[];
  registerTypeHint: string;
};

export const POT_TEMPLATES: PotTemplate[] = [
  {
    id: "stackspot-sequential-pot",
    label: "Sequential pot",
    description:
      "Round-robin winner order via next-payment-id. Delegates treasury through stackspots on start.",
    defaultContractName: "stackspot-sequential-pot",
    sourcePath: "v5/simnet/contracts/stackspot-sequential-pot.clar",
    source: sequentialSource,
    clarityVersion: 3,
    auditVerdict: "CRITICAL_FAIL",
    auditRisk: "CRITICAL",
    registerTypeHint: "stackspot-sequential-pot",
    auditFindings: [
      "VRF not used; sequential winner selection — review get-pot-cycle / distribute timing (AUDIT §9).",
      "extend-delegate-treasury on intermediate claims may fail when stx-account.locked is 0 on devnet.",
      "init-pot is public (not deploy-time only in latest code) — verify before production.",
    ],
  },
  {
    id: "stackspot-jackpot",
    label: "Jackpot",
    description: "VRF-based random winner. Requires stackspot-vrf on deployer.",
    defaultContractName: "stackspot-jackpot",
    sourcePath: "v5/simnet/contracts/stackspot-jackpot.clar",
    source: jackpotSource,
    clarityVersion: 3,
    auditVerdict: "FAIL",
    auditRisk: "HIGH",
    registerTypeHint: "stackspot-jackpot",
    auditFindings: [
      "VRF predictability risk if claim timing is attacker-controlled (AUDIT §9.1).",
      "MAX_PARTICIPANTS off-by-one may allow extra joiner (AUDIT §9.2).",
      "init-pot is explicit post-deploy call in current tree.",
    ],
  },
  {
    id: "stackspot-crowdfund",
    label: "Crowdfund",
    description: "Fixed funding recipient model. No random winner in claim path.",
    defaultContractName: "stackspot-crowdfund",
    sourcePath: "v5/simnet/contracts/stackspot-crowdfund.clar",
    source: crowdfundSource,
    clarityVersion: 3,
    auditVerdict: "FAIL",
    auditRisk: "HIGH",
    registerTypeHint: "stackspot-crowdfund",
    auditFindings: [
      "funding-address fixed at deploy — not a random lottery (AUDIT §10.1–10.2).",
      "Disclose recipient to participants before join.",
    ],
  },
];

export function getPotTemplate(id: PotTemplateId): PotTemplate {
  const t = POT_TEMPLATES.find((p) => p.id === id);
  if (!t) throw new Error(`Unknown pot template: ${id}`);
  return t;
}
