import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const REPORTS_DIR = resolve(process.cwd(), "reports");

export type PartyBalance = {
  address: string;
  stx: string;
  stxRaw: string;
  sbtc: string;
};

export type AuditTxRow = {
  suite: string;
  caseId: string;
  contract: string;
  functionName: string;
  caller: string;
  role: string;
  txid: string;
  stacksBlock: number;
  burnBlock: number;
  poxCycle: number;
  cycleStartBurn: number;
  cycleEndBurn: number;
  expected: string;
  result: string;
  pass: boolean;
  eventCount: number;
  events: string;
  notes: string;
  balances: Record<string, PartyBalance>;
  balancesStx: string;
  balancesSbtc: string;
};

export type MatrixRow = {
  id: string;
  suite: string;
  title: string;
  contract: string;
  poxCycle: number;
  burnBlock: number;
  cycleStartBurn: number;
  cycleEndBurn: number;
  expected: string;
  actual: string;
  pass: boolean;
  notes: string;
};

export const FUNCTION_MAP: Record<string, { public: string[]; readOnly: string[]; private: string[] }> = {
  stackspots: {
    public: [
      "update-minimum-sponsor-amount",
      "add-update-admin-status",
      "update-public-pot-deploy-status",
      "set-pot-contract-hash",
      "update-fee",
      "register-pot",
      "log-pre-init",
      "log-join-pot",
      "log-join-pot-as-sponsor",
      "log-cancel-pot",
      "log-fall-back-cancel",
      "log-claim-pot-reward",
      "log-sponsor-platform",
      "transfer",
      "update-platform-sponsor-contract",
      "verify-platform-sponsor-contract",
    ],
    readOnly: [
      "get-platform-treasury",
      "get-minimum-sponsor-amount",
      "is-admin",
      "can-deploy-pot",
      "is-contract-allowed-hash",
      "get-fee",
      "get-last-token-id",
      "get-token-uri",
      "get-owner",
      "get-token-id",
      "validate-platform-sponsor-contract",
      "get-pot-info",
    ],
    private: ["get-registered-pot-id", "assert-log-caller", "emit-log", "emit-sponsor-log", "mint"],
  },
  "init-admin": {
    public: ["update-contract-hash"],
    readOnly: [],
    private: [],
  },
  jackpot: {
    public: [
      "pull-staking-rewards",
      "join-pot",
      "join-pot-as-sponsor",
      "cancel-pot",
      "start-stackspot-jackpot",
      "claim-pot-reward",
      "init-pot",
    ],
    readOnly: [
      "get-pool-config",
      "validate-can-join-pot",
      "validate-can-claim-pot",
      "validate-pot-value-target-is-met",
      "is-locked",
      "get-pot-details",
      "get-pot-treasury",
      "get-pot-admin",
      "get-staking-meta",
      "get-last-participant",
      "get-configs",
      "get-pot-value",
      "get-pot-participants",
      "get-sponsors-addresses",
      "get-pot-id",
      "get-platform-sponsor-ticket",
      "get-pot-is-init",
    ],
    private: [
      "bind-platform-sponsors",
      "delegate-to-pot",
      "stake-treasury",
      "dispatch-rewards",
      "dispatch-principals",
      "dispatch-sponsor-principals",
    ],
  },
  sequential: {
    public: [
      "pull-staking-rewards",
      "join-pot",
      "join-pot-as-sponsor",
      "cancel-pot",
      "fall-back-cancel",
      "start-stackspot-sequential-pot",
      "claim-pot-reward",
      "init-pot",
    ],
    readOnly: [
      "get-pool-config",
      "validate-can-fall-back-cancel",
      "validate-can-join-pot",
      "validate-can-claim-pot",
      "validate-pot-value-target-is-met",
      "get-pot-details",
      "get-staking-meta",
      "get-platform-sponsor-ticket",
      "get-pot-participants",
      "get-sponsors-addresses",
    ],
    private: [
      "bind-platform-sponsors",
      "delegate-to-pot",
      "stake-treasury",
      "extend-stake",
      "dispatch-principals",
      "dispatch-sponsor-principals",
      "dispatch-rewards",
    ],
  },
  "crowd-fund": {
    public: [
      "pull-staking-rewards",
      "join-pot",
      "join-pot-as-sponsor",
      "cancel-pot",
      "start-stackspot-crowdfund",
      "claim-pot-reward",
      "init-pot",
    ],
    readOnly: [
      "get-pool-config",
      "validate-can-join-pot",
      "validate-can-claim-pot",
      "get-pot-details",
      "get-staking-meta",
      "get-platform-sponsor-ticket",
    ],
    private: [
      "bind-platform-sponsors",
      "delegate-to-pot",
      "stake-treasury",
      "dispatch-principals",
      "dispatch-sponsor-principals",
      "dispatch-rewards",
    ],
  },
  "stackspot-sponsor": {
    public: ["sponsor-platform", "claim-sponsor-reward", "update-rule-set", "sponsor-event", "transfer", "mint"],
    readOnly: [
      "get-pool-config",
      "get-minimum-sponsor-amount",
      "get-rule-sets",
      "get-total-rule-score",
      "get-last-token-id",
      "get-owner",
    ],
    private: [
      "mint-event-ticket",
      "get-total-validated-rule-score",
      "log-sponsor-event",
      "update-rule-loop",
      "check-rule-0",
      "check-rule-1",
      "check-rule-2",
    ],
  },
  "stackspot-vrf": {
    public: [],
    readOnly: ["get-random-uint-at-block", "generate-list"],
    private: [],
  },
};

function ensureReportsDir(): void {
  mkdirSync(REPORTS_DIR, { recursive: true });
}

export function writeJson(name: string, value: unknown): string {
  ensureReportsDir();
  const path = resolve(REPORTS_DIR, name);
  writeFileSync(path, JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  return path;
}

export function writeText(name: string, body: string): string {
  ensureReportsDir();
  const path = resolve(REPORTS_DIR, name);
  writeFileSync(path, body);
  return path;
}

export async function writeAuditWorkbook(rows: AuditTxRow[], matrix: MatrixRow[]): Promise<string> {
  ensureReportsDir();
  const outPath = resolve(REPORTS_DIR, "qa-transaction-log.xlsx");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "StacksPot QA Audit";
  workbook.created = new Date();

  const txSheet = workbook.addWorksheet("Transactions");
  txSheet.columns = [
    { header: "Tx #", key: "txNum", width: 8 },
    { header: "TXID", key: "txid", width: 28 },
    { header: "Suite", key: "suite", width: 22 },
    { header: "Case", key: "caseId", width: 28 },
    { header: "Contract", key: "contract", width: 42 },
    { header: "Function", key: "functionName", width: 32 },
    { header: "Caller", key: "caller", width: 42 },
    { header: "Role", key: "role", width: 18 },
    { header: "PoX cycle", key: "poxCycle", width: 12 },
    { header: "Burn block", key: "burnBlock", width: 12 },
    { header: "Cycle start burn", key: "cycleStartBurn", width: 16 },
    { header: "Cycle end burn", key: "cycleEndBurn", width: 14 },
    { header: "Stacks block", key: "stacksBlock", width: 14 },
    { header: "Expected", key: "expected", width: 16 },
    { header: "Result", key: "result", width: 16 },
    { header: "Pass", key: "pass", width: 10 },
    { header: "Event count", key: "eventCount", width: 12 },
    { header: "STX balances", key: "balancesStx", width: 80 },
    { header: "sBTC balances", key: "balancesSbtc", width: 80 },
    { header: "Events", key: "events", width: 80 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  rows.forEach((row, i) => txSheet.addRow({ txNum: i + 1, ...row }));
  styleHeader(txSheet);

  const labels = [...new Set(rows.flatMap((row) => Object.keys(row.balances ?? {})))];
  const balSheet = workbook.addWorksheet("Balances");
  balSheet.columns = [
    { header: "Tx #", key: "txNum", width: 8 },
    { header: "TXID", key: "txid", width: 28 },
    { header: "Case", key: "caseId", width: 28 },
    { header: "Function", key: "functionName", width: 32 },
    { header: "PoX cycle", key: "poxCycle", width: 12 },
    { header: "Burn block", key: "burnBlock", width: 12 },
    { header: "Cycle start burn", key: "cycleStartBurn", width: 16 },
    { header: "Cycle end burn", key: "cycleEndBurn", width: 14 },
    { header: "Stacks block", key: "stacksBlock", width: 14 },
    { header: "Result", key: "result", width: 14 },
    ...labels.flatMap((label) => [
      { header: `${label} STX`, key: `${label}__stx`, width: 18 },
      { header: `${label} sBTC`, key: `${label}__sbtc`, width: 14 },
    ]),
  ];
  rows.forEach((row, i) => {
    const flat: Record<string, string | number> = {
      txNum: i + 1,
      txid: row.txid,
      caseId: row.caseId,
      functionName: row.functionName,
      poxCycle: row.poxCycle,
      burnBlock: row.burnBlock,
      cycleStartBurn: row.cycleStartBurn,
      cycleEndBurn: row.cycleEndBurn,
      stacksBlock: row.stacksBlock,
      result: row.result,
    };
    for (const label of labels) {
      const party = row.balances?.[label];
      flat[`${label}__stx`] = party?.stx ?? "";
      flat[`${label}__sbtc`] = party?.sbtc ?? "";
    }
    balSheet.addRow(flat);
  });
  styleHeader(balSheet);

  const matrixSheet = workbook.addWorksheet("Pass-Fail Matrix");
  matrixSheet.columns = [
    { header: "#", key: "n", width: 6 },
    { header: "ID", key: "id", width: 28 },
    { header: "Suite", key: "suite", width: 22 },
    { header: "Title", key: "title", width: 48 },
    { header: "Contract", key: "contract", width: 22 },
    { header: "PoX cycle", key: "poxCycle", width: 12 },
    { header: "Burn block", key: "burnBlock", width: 12 },
    { header: "Cycle start burn", key: "cycleStartBurn", width: 16 },
    { header: "Cycle end burn", key: "cycleEndBurn", width: 14 },
    { header: "Expected", key: "expected", width: 16 },
    { header: "Actual", key: "actual", width: 16 },
    { header: "Pass", key: "pass", width: 10 },
    { header: "Notes", key: "notes", width: 48 },
  ];
  matrix.forEach((row, i) => matrixSheet.addRow({ n: i + 1, ...row }));
  styleHeader(matrixSheet);

  try {
    await workbook.xlsx.writeFile(outPath);
    return outPath;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EACCES" && code !== "EBUSY" && code !== "EPERM") throw error;
    const fallback = resolve(REPORTS_DIR, `qa-transaction-log-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(fallback);
    return fallback;
  }
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  header.alignment = { vertical: "middle", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

export function functionMapMarkdown(): string {
  const lines = ["# StacksPot v5 — contract function map", ""];
  for (const [name, fns] of Object.entries(FUNCTION_MAP)) {
    lines.push(`## ${name}`, "");
    lines.push("**Public**");
    for (const f of fns.public) lines.push(`- \`${f}\``);
    if (fns.readOnly.length) {
      lines.push("", "**Read-only**");
      for (const f of fns.readOnly) lines.push(`- \`${f}\``);
    }
    if (fns.private.length) {
      lines.push("", "**Private (representative)**");
      for (const f of fns.private) lines.push(`- \`${f}\``);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function wrapUpMarkdown(matrix: MatrixRow[], txCount: number, extraFindings: string[]): string {
  const passed = matrix.filter((r) => r.pass).length;
  const failed = matrix.filter((r) => !r.pass).length;
  const bySuite = new Map<string, { pass: number; fail: number }>();
  for (const row of matrix) {
    const cur = bySuite.get(row.suite) ?? { pass: 0, fail: 0 };
    if (row.pass) cur.pass += 1;
    else cur.fail += 1;
    bySuite.set(row.suite, cur);
  }
  const lines = [
    "# StacksPot v5 — QA audit wrap-up",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Transactions recorded: **${txCount}**`,
    `- Cases: **${matrix.length}** (pass ${passed} / fail ${failed})`,
    `- Each transaction and pass/fail row includes PoX cycle, burn block, and cycle burn window.`,
    "",
    "## Suite results",
    "",
    "| Suite | Pass | Fail |",
    "| --- | ---: | ---: |",
  ];
  for (const [suite, counts] of bySuite) {
    lines.push(`| ${suite} | ${counts.pass} | ${counts.fail} |`);
  }
  const byContract = new Map<string, { pass: number; fail: number }>();
  for (const row of matrix) {
    const name = row.contract.split(".").pop() ?? row.contract;
    const cur = byContract.get(name) ?? { pass: 0, fail: 0 };
    if (row.pass) cur.pass += 1;
    else cur.fail += 1;
    byContract.set(name, cur);
  }
  lines.push("", "## Contract results", "", "| Contract | Pass | Fail |", "| --- | ---: | ---: |");
  for (const [name, counts] of byContract) {
    lines.push(`| ${name} | ${counts.pass} | ${counts.fail} |`);
  }
  lines.push("", "## Failed cases", "");
  const fails = matrix.filter((r) => !r.pass);
  if (!fails.length) lines.push("None.");
  else {
    lines.push("| ID | Title | Expected | Actual | Notes |", "| --- | --- | --- | --- | --- |");
    for (const f of fails) {
      lines.push(`| ${f.id} | ${f.title} | ${f.expected} | ${f.actual} | ${f.notes} |`);
    }
  }
  if (extraFindings.length) {
    lines.push("", "## Auditor notes", "");
    for (const n of extraFindings) lines.push(`- ${n}`);
  }
  lines.push(
    "",
    "## Artifacts",
    "",
    "- `reports/qa-function-map.md`",
    "- `reports/qa-roles.md`",
    "- `reports/qa-pre-test-snapshot.json`",
    "- `reports/qa-transaction-log.xlsx`",
    "- `reports/qa-transaction-log.json`",
    "- `reports/qa-balances.json`",
    "- `reports/qa-balances.md`",
    "- `reports/qa-pass-fail-matrix.md`",
    "- `reports/qa-contract-matrix.md`",
    "- `reports/qa-wrap-up.md`",
    ""
  );
  return lines.join("\n");
}

export function matrixMarkdown(matrix: MatrixRow[]): string {
  const lines = [
    "# Pass / fail matrix",
    "",
    "| ID | Suite | Title | Contract | PoX cycle | Burn | Cycle burns | Expected | Actual | Pass | Notes |",
    "| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |",
  ];
  for (const row of matrix) {
    lines.push(
      `| ${row.id} | ${row.suite} | ${row.title} | ${row.contract} | ${row.poxCycle} | ${row.burnBlock} | ${row.cycleStartBurn}–${row.cycleEndBurn} | ${row.expected} | ${row.actual} | ${row.pass ? "PASS" : "FAIL"} | ${row.notes} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}
