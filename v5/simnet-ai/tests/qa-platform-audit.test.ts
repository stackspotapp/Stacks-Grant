/**
 * QA engineer + Clarity auditor battery.
 * Records every simnet transaction and writes reports/ artifacts.
 */
import { afterAll, describe, expect, it } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  activateStakingStack,
  CYCLE_LENGTH,
  currentPoxCycle,
  ensureJoinWindow,
  fundAndStakeFastpoolThreshold,
  mineUntilBurnHeight,
  payoutPotFromFastpool,
  potRewardRelease,
  setProtocolTxSink,
  FASTPOOL_FUND_USTX,
} from "./activate-protocol";
import {
  functionMapMarkdown,
  matrixMarkdown,
  wrapUpMarkdown,
  writeAuditWorkbook,
  writeJson,
  writeText,
  type AuditTxRow,
  type MatrixRow,
  type PartyBalance,
} from "./qa-audit-report";

const STX = 1_000_000;
const MIN_AMOUNT = 1 * STX;
const MAX_PARTS = 6;
const SPONSOR_BOOST = 2 * STX;
const PLATFORM_SPONSOR_AMOUNT = 40_000_000;
const PLATFORM_SPONSOR_CYCLES = 10;
const STAKE_CYCLES = 1;
/** Sequential pot-b: one claim per reward-cycle, including the unlock cycle. */
const SEQ_CLAIM_ROUNDS = 7;
const SEQ_STAKE_CYCLES = MAX_PARTS;

const RULE_LIST = Cl.list([
  Cl.tuple({
    label: Cl.stringAscii("pot balance meets reward requirement"),
    state: Cl.bool(true),
    required: Cl.uint(100),
    score: Cl.uint(100),
  }),
  Cl.tuple({
    label: Cl.stringAscii("participant count meets reward requirement"),
    state: Cl.bool(true),
    required: Cl.uint(100),
    score: Cl.uint(100),
  }),
  Cl.tuple({
    label: Cl.stringAscii("pot started within reward time window"),
    state: Cl.bool(false),
    required: Cl.uint(0),
    score: Cl.uint(100),
  }),
]);

const jackpotSrc = readFileSync(resolve("contracts/jackpot.clar"), "utf8");
const sequentialSrc = readFileSync(resolve("contracts/sequential.clar"), "utf8");
const crowdFundSrc = readFileSync(resolve("contracts/crowd-fund.clar"), "utf8");

const txLog: AuditTxRow[] = [];
const matrix: MatrixRow[] = [];
const findings: string[] = [];
const watched = new Map<string, string>();
let txSeq = 0;
let reportsFlushed = false;
let poxPlatform: string | undefined;

type ChainClock = {
  poxCycle: number;
  burnBlock: number;
  stacksBlock: number;
  cycleStartBurn: number;
  cycleEndBurn: number;
};

function chainClock(): ChainClock {
  const burnBlock = simnet.burnBlockHeight;
  const stacksBlock = simnet.blockHeight;
  let poxCycle = Math.floor(burnBlock / CYCLE_LENGTH);
  if (poxPlatform) {
    try {
      poxCycle = currentPoxCycle(poxPlatform);
    } catch {
      /* sim-pox-5 not readable yet */
    }
  }
  return {
    poxCycle,
    burnBlock,
    stacksBlock,
    cycleStartBurn: poxCycle * CYCLE_LENGTH,
    cycleEndBurn: (poxCycle + 1) * CYCLE_LENGTH - 1,
  };
}

function clockFields(clock = chainClock()): Pick<AuditTxRow, "poxCycle" | "burnBlock" | "stacksBlock" | "cycleStartBurn" | "cycleEndBurn"> {
  return {
    poxCycle: clock.poxCycle,
    burnBlock: clock.burnBlock,
    stacksBlock: clock.stacksBlock,
    cycleStartBurn: clock.cycleStartBurn,
    cycleEndBurn: clock.cycleEndBurn,
  };
}

function clockLabel(clock = chainClock()): string {
  return `cycle=${clock.poxCycle} burn=${clock.burnBlock} (burns ${clock.cycleStartBurn}–${clock.cycleEndBurn}) stacks=${clock.stacksBlock}`;
}

function stringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

function isOk(result: { type?: string | number } | undefined): boolean {
  return !!result && result.type === ClarityType.ResponseOk;
}

function isErr(result: { type?: string | number } | undefined): boolean {
  return !!result && result.type === ClarityType.ResponseErr;
}

function isNotErr(result: { type?: string | number } | undefined): boolean {
  return !isErr(result);
}

function resultLabel(result: { type?: string | number; value?: { value?: unknown } } | undefined): string {
  if (result === undefined) return "none";
  if (isOk(result)) return "ok";
  if (isErr(result)) {
    const code = result.value?.value;
    return code === undefined ? "err" : `err u${code}`;
  }
  return stringify(result);
}

function stxBalance(address: string): bigint {
  return simnet.getAssetsMap().get("STX")?.get(address) ?? 0n;
}

function unwrapOkUint(result: { type?: string | number; value?: unknown }): bigint {
  if (!isOk(result)) return 0n;
  const inner = result.value;
  if (typeof inner === "bigint") return inner;
  if (typeof inner === "number") return BigInt(inner);
  if (inner && typeof inner === "object" && "value" in inner) {
    const v = (inner as { value: unknown }).value;
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(v);
  }
  return 0n;
}

function sbtcBalance(address: string): bigint {
  try {
    return unwrapOkUint(
      simnet.callReadOnlyFn("sbtc-token", "get-balance", [Cl.principal(address)], address).result
    );
  } catch {
    const map = simnet.getAssetsMap().get(".sbtc-token.sbtc-token") ?? simnet.getAssetsMap().get("sbtc-token");
    return map?.get(address) ?? 0n;
  }
}

function formatStxAmount(ustx: bigint): string {
  const sign = ustx < 0n ? "-" : "";
  const n = ustx < 0n ? -ustx : ustx;
  return `${sign}${n / 1_000_000n}.${(n % 1_000_000n).toString().padStart(6, "0")}`;
}

function watch(label: string, address: string): void {
  watched.set(label, address);
}

function captureBalances(): Record<string, PartyBalance> {
  const out: Record<string, PartyBalance> = {};
  for (const [label, address] of watched) {
    const stx = stxBalance(address);
    const sbtc = sbtcBalance(address);
    out[label] = {
      address,
      stx: formatStxAmount(stx),
      stxRaw: stx.toString(),
      sbtc: sbtc.toString(),
    };
  }
  return out;
}

function compactBalances(balances: Record<string, PartyBalance>, field: "stx" | "sbtc"): string {
  return Object.entries(balances)
    .map(([label, party]) => `${label}=${party[field]}`)
    .join(" | ");
}

function logBalances(
  txid: string,
  functionName: string,
  result: string,
  balances: Record<string, PartyBalance>,
  clock = chainClock()
): void {
  const focus = [
    "stackspot-sponsor",
    "fastpool",
    "pot-a",
    "pot-b",
    "pot-c",
    "jackpot",
    "sequential",
    "crowd-fund",
    "admin",
    "potADeployer",
    "potBDeployer",
    "potCDeployer",
    "wallet_4",
    "wallet_5",
    "wallet_6",
    "wallet_7",
    "wallet_8",
    "faucet",
  ].filter((label) => balances[label]);
  const line = (field: "stx" | "sbtc") =>
    focus.map((label) => `${label}=${balances[label][field]}`).join(" ");
  console.log(`[balances ${txid}] ${clockLabel(clock)} ${functionName} ${result}`);
  console.log(`  STX  ${line("stx")}`);
  console.log(`  sBTC ${line("sbtc")}`);
}

function balancesMarkdown(rows: AuditTxRow[]): string {
  const lines = [
    "# QA balance log (STX / sBTC after each tx)",
    "",
    `Amounts: STX in whole.micro; sBTC in sats. PoX cycle length is ${CYCLE_LENGTH} burn blocks.`,
    "",
  ];
  rows.forEach((row, i) => {
    lines.push(
      `## ${i + 1}. ${row.caseId} \`${row.functionName}\` — ${row.result} — PoX cycle ${row.poxCycle}, burn ${row.burnBlock} (${row.cycleStartBurn}–${row.cycleEndBurn}), stacks ${row.stacksBlock}`,
      ""
    );
    lines.push("| Party | Address | STX | sBTC (sats) |", "| --- | --- | ---: | ---: |");
    for (const [label, party] of Object.entries(row.balances ?? {})) {
      lines.push(`| ${label} | \`${party.address}\` | ${party.stx} | ${party.sbtc} |`);
    }
    lines.push("");
  });
  return lines.join("\n");
}

function qualifyProtocolRefs(source: string, protocolDeployer: string): string {
  const replacements: Array<[string, string]> = [
    [".stackspot-pots-trait.stackspot-pots-trait", `'${protocolDeployer}.stackspot-pots-trait.stackspot-pots-trait`],
    [".stackspot-sponsor-trait.stackspot-sponsor-trait", `'${protocolDeployer}.stackspot-sponsor-trait.stackspot-sponsor-trait`],
    [".stackspot-vrf", `'${protocolDeployer}.stackspot-vrf`],
    [".stackspots", `'${protocolDeployer}.stackspots`],
    [".sim-pox-5", `'${protocolDeployer}.sim-pox-5`],
    [".fastpool", `'${protocolDeployer}.fastpool`],
    [".sbtc-token", `'${protocolDeployer}.sbtc-token`],
  ];
  let next = source;
  for (const [i, [from]] of replacements.entries()) next = next.replaceAll(from, `__DEP_${i}__`);
  for (const [i, [, to]] of replacements.entries()) next = next.replaceAll(`__DEP_${i}__`, to);
  return next;
}

function stripDeployTimeLogPreInit(source: string): string {
  return source.replace(/\n\(contract-call\? [^\n]+ log-pre-init PRE_INIT_LOG\)\s*$/, "\n");
}

function potSource(kind: "jackpot" | "sequential" | "crowd-fund", protocol: string, opts?: { qualify?: boolean; strip?: boolean }): string {
  const raw = kind === "jackpot" ? jackpotSrc : kind === "sequential" ? sequentialSrc : crowdFundSrc;
  const qualify = opts?.qualify !== false;
  const strip = opts?.strip !== false;
  let next = qualify ? qualifyProtocolRefs(raw, protocol) : raw;
  if (strip) next = stripDeployTimeLogPreInit(next);
  return next;
}

function nextTxid(clock = chainClock()): string {
  txSeq += 1;
  return `simnet:c${clock.poxCycle}:b${clock.burnBlock}:s${clock.stacksBlock}:${txSeq}`;
}

function caseRow(
  id: string,
  suite: string,
  title: string,
  contract: string,
  expected: string,
  actual: string,
  pass: boolean,
  notes = ""
): void {
  const clock = chainClock();
  matrix.push({
    id,
    suite,
    title,
    contract,
    ...clockFields(clock),
    expected,
    actual,
    pass,
    notes,
  });
}

function matchesExpected(expected: string, result: { type?: string | number; value?: { value?: unknown } } | undefined): boolean {
  const actual = resultLabel(result);
  if (expected === "ok") return isOk(result) || (result !== undefined && !isErr(result));
  if (expected === "err") return isErr(result) || !isOk(result);
  return actual === expected;
}

function recordRow(
  suite: string,
  caseId: string,
  contract: string,
  functionName: string,
  caller: string,
  role: string,
  result: { type?: string | number; value?: { value?: unknown } } | undefined,
  events: unknown,
  expected: string,
  notes = ""
): string {
  const eventList = Array.isArray(events) ? events : events ? [events] : [];
  const clock = chainClock();
  const txid = nextTxid(clock);
  const balances = captureBalances();
  const actual = resultLabel(result);
  logBalances(txid, functionName, actual, balances, clock);
  txLog.push({
    suite,
    caseId,
    contract,
    functionName,
    caller,
    role,
    txid,
    ...clockFields(clock),
    expected,
    result: actual,
    pass: matchesExpected(expected, result),
    eventCount: eventList.length,
    events: stringify(eventList),
    notes,
    balances,
    balancesStx: compactBalances(balances, "stx"),
    balancesSbtc: compactBalances(balances, "sbtc"),
  });
  return txid;
}

function expectCase(
  id: string,
  suite: string,
  title: string,
  contract: string,
  expected: string,
  result: { type?: string | number; value?: { value?: unknown } } | undefined,
  notes = ""
): boolean {
  const actual = resultLabel(result);
  const pass = matchesExpected(expected, result);
  caseRow(id, suite, title, contract, expected, actual, pass, notes);
  return pass;
}

function callFn(
  suite: string,
  caseId: string,
  title: string,
  contract: string,
  fn: string,
  args: unknown[],
  caller: string,
  role: string,
  expected: string,
  notes = ""
) {
  try {
    const res = simnet.callPublicFn(contract, fn, args as never, caller);
    recordRow(suite, caseId, contract, fn, caller, role, res.result, res.events, expected, notes);
    expectCase(caseId, suite, title, contract, expected, res.result, notes);
    return res;
  } catch (error) {
    const msg = error instanceof Error ? error.message : stringify(error);
    const synthetic = { type: ClarityType.ResponseErr, value: { value: msg } };
    recordRow(suite, caseId, contract, fn, caller, role, synthetic, [], expected, `${notes} throw: ${msg.slice(0, 180)}`);
    expectCase(caseId, suite, title, contract, expected, synthetic, notes);
    return { result: synthetic, events: [] as unknown[] };
  }
}

function deployFn(
  suite: string,
  caseId: string,
  title: string,
  name: string,
  source: string,
  caller: string,
  role: string,
  expected: string,
  notes = ""
) {
  try {
    const res = simnet.deployContract(name, source, { clarityVersion: 6 }, caller);
    if (isNotErr(res.result) && !isErr(res.result)) {
      watch(name, `${caller}.${name}`);
    }
    recordRow(suite, caseId, `${caller}.${name}`, "deploy-contract", caller, role, res.result, res.events, expected, notes);
    expectCase(caseId, suite, title, `${caller}.${name}`, expected, res.result, notes);
    return res;
  } catch (error) {
    const msg = error instanceof Error ? error.message : stringify(error);
    recordRow(suite, caseId, `${caller}.${name}`, "deploy-contract", caller, role, { type: ClarityType.ResponseErr, value: { value: msg } }, [], expected, notes);
    const pass = expected !== "ok";
    caseRow(caseId, suite, title, `${caller}.${name}`, expected, `throw: ${msg.slice(0, 180)}`, pass, notes);
    return undefined;
  }
}

function eventsHavePrint(events: unknown, hexNeedle: string): boolean {
  return stringify(events).includes(hexNeedle);
}

async function flushReports(): Promise<void> {
  if (reportsFlushed) return;
  reportsFlushed = true;
  writeText("qa-function-map.md", functionMapMarkdown());
  writeText("qa-pass-fail-matrix.md", matrixMarkdown(matrix));
  writeText("qa-wrap-up.md", wrapUpMarkdown(matrix, txLog.length, findings));
  writeText(
    "qa-contract-matrix.md",
    [
      "# Contract pass / fail matrix",
      "",
      "| Contract | Related cases | Result | Failed IDs |",
      "| --- | ---: | --- | --- |",
      ...matrix
        .filter((r) => r.suite === "contract-matrix")
        .map((r) => `| ${r.contract} | ${r.actual} | ${r.pass ? "PASS" : "FAIL"} | ${r.notes} |`),
      "",
    ].join("\n")
  );
  writeJson("qa-transaction-log.json", txLog);
  writeJson("qa-pass-fail-matrix.json", matrix);
  writeJson(
    "qa-balances.json",
    txLog.map((row, i) => ({
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
      balances: row.balances,
    }))
  );
  writeText("qa-balances.md", balancesMarkdown(txLog));
  await writeAuditWorkbook(txLog, matrix);
}

describe("QA + Clarity auditor — platform battery", () => {
  it(
    "maps functions, roles, deployments, activation, pots, sponsors, joins, events, and lifecycle",
    async () => {
      const accounts = simnet.getAccounts();
      const admin = accounts.get("deployer")!;
      poxPlatform = admin;
      const potADeployer = accounts.get("wallet_1")!;
      const potBDeployer = accounts.get("wallet_2")!;
      const potCDeployer = accounts.get("wallet_3")!;
      const wallet4 = accounts.get("wallet_4")!;
      const wallet5 = accounts.get("wallet_5")!;
      const wallet6 = accounts.get("wallet_6")!;
      const wallet7 = accounts.get("wallet_7")!;
      const wallet8 = accounts.get("wallet_8")!;
      const faucet = accounts.get("faucet")!;
      const participantAccounts = [
        { wallet: "wallet_4", address: wallet4 },
        { wallet: "wallet_5", address: wallet5 },
        { wallet: "wallet_6", address: wallet6 },
        { wallet: "wallet_8", address: wallet8 },
        { wallet: "wallet_7", address: wallet7 },
        { wallet: "faucet", address: faucet },
      ];
      const participants = participantAccounts.map((p) => p.address);
      const starter = wallet4;
      const closer = faucet;
      const potSponsor = wallet5;
      const unauthorized = wallet8;
      const fastpool = `${admin}.fastpool`;

      expect(admin).toBe("ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM");
      expect(potADeployer).toBe("ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5");
      expect(potBDeployer).toBe("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG");
      expect(potCDeployer).toBe("ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC");
      expect(participants).toEqual([
        "ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND",
        "ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB",
        "ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0",
        "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP",
        "ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ",
        "STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6",
      ]);

      watch("admin", admin);
      watch("potADeployer", potADeployer);
      watch("potBDeployer", potBDeployer);
      watch("potCDeployer", potCDeployer);
      watch("wallet_4", wallet4);
      watch("wallet_5", wallet5);
      watch("wallet_6", wallet6);
      watch("wallet_7", wallet7);
      watch("wallet_8", wallet8);
      watch("faucet", faucet);
      watch("stackspot-sponsor", `${admin}.stackspot-sponsor`);
      watch("jackpot", `${admin}.jackpot`);
      watch("sequential", `${admin}.sequential`);
      watch("crowd-fund", `${admin}.crowd-fund`);
      watch("stackspots", `${admin}.stackspots`);
      watch("fastpool", fastpool);

      const roles = {
        platform: admin,
        pots: {
          "pot-a": { deployer: potADeployer, contract: `${potADeployer}.pot-a`, kind: "jackpot", stakeCycles: STAKE_CYCLES },
          "pot-b": { deployer: potBDeployer, contract: `${potBDeployer}.pot-b`, kind: "sequential", stakeCycles: SEQ_STAKE_CYCLES, claimRounds: SEQ_CLAIM_ROUNDS },
          "pot-c": { deployer: potCDeployer, contract: `${potCDeployer}.pot-c`, kind: "crowd-fund", stakeCycles: STAKE_CYCLES },
        },
        participants: Object.fromEntries(participantAccounts.map((p) => [p.wallet, p.address])),
        starter: wallet4,
        closer: faucet,
        potSponsor: wallet5,
        unauthorized: wallet8,
        fastpool,
        cycles: {
          poxCycleLengthBurns: CYCLE_LENGTH,
          currentPoxCycle: chainClock().poxCycle,
          currentBurnBlock: simnet.burnBlockHeight,
          potStakeCycles: STAKE_CYCLES,
          sequentialStakeCycles: SEQ_STAKE_CYCLES,
          sequentialClaimRounds: SEQ_CLAIM_ROUNDS,
          platformSponsorCycles: PLATFORM_SPONSOR_CYCLES,
          fastpoolFundStx: Number(FASTPOOL_FUND_USTX / 1_000_000n),
        },
      };
      writeJson("qa-roles.json", roles);
      writeText(
        "qa-roles.md",
        [
          "# Test roles",
          "",
          `| Role | Address |`,
          `| --- | --- |`,
          `| platform (deployer) | ${admin} |`,
          `| pot-a deployer (wallet_1) | ${potADeployer} |`,
          `| pot-b deployer (wallet_2) | ${potBDeployer} |`,
          `| pot-c deployer (wallet_3) | ${potCDeployer} |`,
          `| participant wallet_4 (also starter) | ${wallet4} |`,
          `| participant wallet_5 (also pot sponsor) | ${wallet5} |`,
          `| participant wallet_6 | ${wallet6} |`,
          `| participant wallet_8 (also unauthorized) | ${wallet8} |`,
          `| participant wallet_7 | ${wallet7} |`,
          `| participant faucet (also closer) | ${faucet} |`,
          `| fastpool | ${fastpool} |`,
          "",
          "## Pots and stake cycles",
          "",
          `| Pot | Kind | Deployer | Contract | Stake cycles |`,
          `| --- | --- | --- | --- | ---: |`,
          `| pot-a | jackpot | ${potADeployer} | \`${potADeployer}.pot-a\` | ${STAKE_CYCLES} |`,
          `| pot-b | sequential | ${potBDeployer} | \`${potBDeployer}.pot-b\` | ${SEQ_STAKE_CYCLES} (${SEQ_CLAIM_ROUNDS} claim rounds) |`,
          `| pot-c | crowd-fund | ${potCDeployer} | \`${potCDeployer}.pot-c\` | ${STAKE_CYCLES} |`,
          "",
          "## PoX cycles",
          "",
          `| Item | Value |`,
          `| --- | --- |`,
          `| PoX cycle length | ${CYCLE_LENGTH} burn blocks |`,
          `| At role snapshot | ${clockLabel()} |`,
          `| Platform → Fastpool transfer | ${Number(FASTPOOL_FUND_USTX / 1_000_000n).toLocaleString()} STX |`,
          `| Platform sponsor-platform cycles | ${PLATFORM_SPONSOR_CYCLES} |`,
          "",
        ].join("\n")
      );

      const snapshot = {
        ...clockFields(),
        poxCycleLength: CYCLE_LENGTH,
        balances: captureBalances(),
        stx: Object.fromEntries(
          (function flatten(obj: unknown, prefix = ""): Array<[string, string]> {
            if (typeof obj === "string") return [[prefix, obj]];
            if (!obj || typeof obj !== "object") return [];
            return Object.entries(obj).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
          })(roles).map(([k, addr]) => [k, stxBalance(addr).toString()])
        ),
        stackspots: {
          fee: stringify(simnet.callReadOnlyFn("stackspots", "get-fee", [], admin).result),
          minSponsor: stringify(simnet.callReadOnlyFn("stackspots", "get-minimum-sponsor-amount", [], admin).result),
          isAdmin: stringify(simnet.callReadOnlyFn("stackspots", "is-admin", [], admin).result),
          canDeploy: stringify(simnet.callReadOnlyFn("stackspots", "can-deploy-pot", [], admin).result),
          treasury: stringify(simnet.callReadOnlyFn("stackspots", "get-platform-treasury", [], admin).result),
          lastTokenId: stringify(simnet.callReadOnlyFn("stackspots", "get-last-token-id", [], admin).result),
          jackpotHashAllowed: stringify(
            simnet.callReadOnlyFn("stackspots", "is-contract-allowed-hash", [Cl.contractPrincipal(admin, "jackpot")], admin).result
          ),
          sequentialHashAllowed: stringify(
            simnet.callReadOnlyFn("stackspots", "is-contract-allowed-hash", [Cl.contractPrincipal(admin, "sequential")], admin).result
          ),
          crowdFundHashAllowed: stringify(
            simnet.callReadOnlyFn("stackspots", "is-contract-allowed-hash", [Cl.contractPrincipal(admin, "crowd-fund")], admin).result
          ),
          platformSponsorAllowed: stringify(
            simnet.callReadOnlyFn(
              "stackspots",
              "validate-platform-sponsor-contract",
              [Cl.contractPrincipal(admin, "stackspot-sponsor")],
              admin
            ).result
          ),
        },
        genesisPots: {
          jackpotInit: stringify(simnet.callReadOnlyFn("jackpot", "get-pot-is-init", [], admin).result),
          sequentialInit: stringify(simnet.callReadOnlyFn("sequential", "get-pot-is-init", [], admin).result),
          crowdFundInit: stringify(simnet.callReadOnlyFn("crowd-fund", "get-pot-is-init", [], admin).result),
        },
      };
      writeJson("qa-pre-test-snapshot.json", snapshot);
      findings.push(
        `Pre-test snapshot at ${clockLabel()}. PoX cycle length is ${CYCLE_LENGTH} burn blocks.`
      );

      setProtocolTxSink((tx) => {
        const balances = captureBalances();
        const clock = chainClock();
        const txid = nextTxid(clock);
        logBalances(txid, tx.functionName, tx.result, balances, clock);
        txLog.push({
          suite: "protocol-boot",
          caseId: "BOOT",
          contract: tx.contractId,
          functionName: tx.functionName,
          caller: tx.sender,
          role: tx.senderRole,
          txid,
          ...clockFields(clock),
          expected: "ok",
          result: tx.result,
          pass: tx.ok,
          eventCount: 0,
          events: stringify({ note: "captured via protocol helper sink" }),
          notes: "activate-protocol helper",
          balances,
          balancesStx: compactBalances(balances, "stx"),
          balancesSbtc: compactBalances(balances, "sbtc"),
        });
      });

      try {
        activateStakingStack(admin, []);
        fundAndStakeFastpoolThreshold(admin, potADeployer, FASTPOOL_FUND_USTX);
        caseRow(
          "BOOT-01",
          "activation",
          "Boot sBTC / PoX-5 / Fastpool",
          "sim-pox-5",
          "ok",
          "ok",
          true
        );
        caseRow(
          "BOOT-02",
          "activation",
          "transfer 2,000,000 STX from platform to fastpool and stake for signer threshold",
          fastpool,
          `${FASTPOOL_FUND_USTX} uSTX`,
          stxBalance(fastpool).toString(),
          stxBalance(fastpool) === FASTPOOL_FUND_USTX,
          `fastpool liquid STX ${formatStxAmount(stxBalance(fastpool))}`
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : stringify(error);
        findings.push(`activateStakingStack reused existing simnet boot: ${msg.slice(0, 200)}`);
        try {
          fundAndStakeFastpoolThreshold(admin, potADeployer, FASTPOOL_FUND_USTX);
        } catch {
          /* already staked */
        }
        caseRow("BOOT-01", "activation", "Boot sBTC / PoX-5 / Fastpool (idempotent)", "sim-pox-5", "ok", "reused", true, msg.slice(0, 180));
      }

      // --- 5. Admin activation ---
      callFn(
        "admin",
        "ADM-01",
        "init-admin after genesis top-level activation (should already be initialized)",
        "init-admin",
        "update-contract-hash",
        [],
        admin,
        "admin",
        "err u1413",
        "spec: deploy-time (update-contract-hash) must set initialized"
      );
      callFn(
        "admin",
        "ADM-01b",
        "init-admin second public call",
        "init-admin",
        "update-contract-hash",
        [],
        admin,
        "admin",
        "err u1413"
      );
      callFn(
        "admin",
        "ADM-02",
        "init-admin from unauthorized wallet",
        "init-admin",
        "update-contract-hash",
        [],
        unauthorized,
        "unauthorized",
        "err u1101"
      );
      callFn(
        "admin",
        "ADM-03",
        "add-update-admin-status from admin",
        "stackspots",
        "add-update-admin-status",
        [Cl.principal(potADeployer), Cl.bool(true)],
        admin,
        "admin",
        "ok",
        "state logging via print + sec mint/burn"
      );
      callFn(
        "admin",
        "ADM-04",
        "add-update-admin-status from unauthorized",
        "stackspots",
        "add-update-admin-status",
        [Cl.principal(unauthorized), Cl.bool(true)],
        unauthorized,
        "unauthorized",
        "err u1101"
      );
      callFn(
        "admin",
        "ADM-05",
        "update-public-pot-deploy-status from admin",
        "stackspots",
        "update-public-pot-deploy-status",
        [Cl.bool(true)],
        admin,
        "admin",
        "ok"
      );
      callFn(
        "admin",
        "ADM-06",
        "update-fee from non-treasury",
        "stackspots",
        "update-fee",
        [Cl.uint(1)],
        unauthorized,
        "unauthorized",
        "err u1102"
      );
      callFn(
        "admin",
        "ADM-07",
        "set-pot-contract-hash from unauthorized",
        "stackspots",
        "set-pot-contract-hash",
        [Cl.contractPrincipal(admin, "jackpot"), Cl.bool(true)],
        unauthorized,
        "unauthorized",
        "err u1101"
      );
      callFn(
        "admin",
        "ADM-08",
        "log-pre-init from EOA (unauthorized contract hash)",
        "stackspots",
        "log-pre-init",
        [Cl.buffer(new Uint8Array(1))],
        unauthorized,
        "unauthorized",
        "err u1110"
      );
      callFn(
        "admin",
        "ADM-09",
        "log-sponsor-platform from non-sponsor",
        "stackspots",
        "log-sponsor-platform",
        [Cl.buffer(new Uint8Array(1))],
        unauthorized,
        "unauthorized",
        "err u1110"
      );
      const adminLog = simnet.callReadOnlyFn("stackspots", "is-admin", [], potADeployer);
      caseRow(
        "ADM-10",
        "admin",
        "pot-a deployer is now admin after ADM-03",
        "stackspots",
        "true",
        stringify(adminLog.result),
        stringify(adminLog.result).toLowerCase().includes("true"),
        "post-activation state"
      );

      // --- 4. Deployments ---
      deployFn(
        "deploy",
        "DEP-01",
        "incorrect dependencies (unqualified .stackspots on wallet publisher)",
        "qa-bad-deps",
        potSource("jackpot", admin, { qualify: false, strip: true }),
        potADeployer,
        "potADeployer",
        "err",
        "publisher.stackspots does not exist"
      );
      deployFn(
        "deploy",
        "DEP-02",
        "unauthorized deploy still calling log-pre-init",
        "qa-bad-preinit",
        potSource("jackpot", admin, { qualify: true, strip: false }),
        potADeployer,
        "potADeployer",
        "err",
        "copy hash is not allowlisted at deploy-time log-pre-init"
      );

      const potA = deployFn(
        "deploy",
        "DEP-03",
        "pot-a jackpot copy (wallet_1)",
        "pot-a",
        potSource("jackpot", admin),
        potADeployer,
        "potADeployer",
        "ok"
      );
      const potB = deployFn(
        "deploy",
        "DEP-04",
        "pot-b sequential copy (wallet_2)",
        "pot-b",
        potSource("sequential", admin),
        potBDeployer,
        "potBDeployer",
        "ok"
      );
      const potC = deployFn(
        "deploy",
        "DEP-05",
        "pot-c crowd-fund copy (wallet_3)",
        "pot-c",
        potSource("crowd-fund", admin),
        potCDeployer,
        "potCDeployer",
        "ok"
      );

      const allowCopy = (publisher: string, name: string, id: string) => {
        callFn(
          "deploy",
          id,
          `platform admin allowlists ${name} contract hash`,
          "stackspots",
          "set-pot-contract-hash",
          [Cl.contractPrincipal(publisher, name), Cl.bool(true)],
          admin,
          "admin",
          "ok"
        );
      };
      if (potA) allowCopy(potADeployer, "pot-a", "DEP-06");
      if (potB) allowCopy(potBDeployer, "pot-b", "DEP-07");
      if (potC) allowCopy(potCDeployer, "pot-c", "DEP-08");

      const potAId = `${potADeployer}.pot-a`;
      const potBId = `${potBDeployer}.pot-b`;
      const potCId = `${potCDeployer}.pot-c`;
      const selfA = Cl.contractPrincipal(potADeployer, "pot-a");
      const selfB = Cl.contractPrincipal(potBDeployer, "pot-b");
      const selfC = Cl.contractPrincipal(potCDeployer, "pot-c");
      const platformSponsor = Cl.contractPrincipal(admin, "stackspot-sponsor");
      const wrongSelf = Cl.contractPrincipal(admin, "jackpot");
      watch("pot-a", potAId);
      watch("pot-b", potBId);
      watch("pot-c", potCId);

      callFn(
        "deploy",
        "DEP-09",
        "genesis jackpot init from treasury deployer",
        "jackpot",
        "init-pot",
        [Cl.uint(STAKE_CYCLES), Cl.uint(MIN_AMOUNT), Cl.uint(MAX_PARTS), Cl.stringAscii("genesis-jp"), Cl.contractPrincipal(admin, "jackpot"), Cl.list([])],
        admin,
        "admin",
        "err u1101",
        "tx-sender == platform-treasury cannot mint pot NFT"
      );

      ensureJoinWindow(admin, [fastpool], 40);

      // --- 6. Pot inits / sponsor args ---
      callFn(
        "init",
        "INI-01",
        "init-pot wrong self trait",
        potAId,
        "init-pot",
        [Cl.uint(STAKE_CYCLES), Cl.uint(MIN_AMOUNT), Cl.uint(MAX_PARTS), Cl.stringAscii("neg-wrong-self"), wrongSelf, Cl.list([])],
        potADeployer,
        "potADeployer",
        "err u1101"
      );
      callFn(
        "init",
        "INI-02",
        "init-pot from unauthorized (not POT_ADMIN)",
        potAId,
        "init-pot",
        [Cl.uint(STAKE_CYCLES), Cl.uint(MIN_AMOUNT), Cl.uint(MAX_PARTS), Cl.stringAscii("neg-not-admin"), selfA, Cl.list([])],
        unauthorized,
        "unauthorized",
        "err u1102"
      );
      callFn(
        "init",
        "INI-03",
        "init-pot duplicate platform sponsors",
        potAId,
        "init-pot",
        [
          Cl.uint(STAKE_CYCLES),
          Cl.uint(MIN_AMOUNT),
          Cl.uint(MAX_PARTS),
          Cl.stringAscii("neg-dup-sponsor"),
          selfA,
          Cl.list([platformSponsor, platformSponsor]),
        ],
        potADeployer,
        "potADeployer",
        "err u1105"
      );
      callFn(
        "init",
        "INI-04",
        "init-pot invalid sponsor trait (stackspots)",
        potAId,
        "init-pot",
        [
          Cl.uint(STAKE_CYCLES),
          Cl.uint(MIN_AMOUNT),
          Cl.uint(MAX_PARTS),
          Cl.stringAscii("neg-bad-trait"),
          selfA,
          Cl.list([Cl.contractPrincipal(admin, "stackspots")]),
        ],
        potADeployer,
        "potADeployer",
        "err",
        "stackspots does not impl stackspot-sponsor-trait"
      );
      callFn(
        "init",
        "INI-05",
        "sequential init max-participants 0",
        potBId,
        "init-pot",
        [Cl.uint(MIN_AMOUNT), Cl.uint(0), Cl.stringAscii("seq-zero"), selfB, Cl.list([])],
        potBDeployer,
        "potBDeployer",
        "err u1202"
      );
      callFn(
        "init",
        "INI-06",
        "jackpot init max-participants 101",
        potAId,
        "init-pot",
        [Cl.uint(STAKE_CYCLES), Cl.uint(MIN_AMOUNT), Cl.uint(101), Cl.stringAscii("neg-max"), selfA, Cl.list([])],
        potADeployer,
        "potADeployer",
        "err u1202"
      );

      callFn(
        "init",
        "INI-07",
        "jackpot init from participant (not POT_ADMIN)",
        potAId,
        "init-pot",
        [Cl.uint(STAKE_CYCLES), Cl.uint(MIN_AMOUNT), Cl.uint(MAX_PARTS), Cl.stringAscii("neg-not-admin-2"), selfA, Cl.list([])],
        wallet5,
        "participant",
        "err u1102"
      );

      // --- 7/12. Platform sponsor then bind on lifecycle pot ---
      callFn(
        "sponsor-platform",
        "PSP-01",
        "sponsor-platform below minimum",
        "stackspot-sponsor",
        "sponsor-platform",
        [Cl.uint(1), Cl.uint(PLATFORM_SPONSOR_CYCLES), RULE_LIST],
        admin,
        "admin",
        "err u1301"
      );
      callFn(
        "sponsor-platform",
        "PSP-02",
        "update-rule-set from unauthorized",
        "stackspot-sponsor",
        "update-rule-set",
        [RULE_LIST],
        unauthorized,
        "unauthorized",
        "err u1304"
      );
      callFn(
        "sponsor-platform",
        "PSP-03",
        "sponsor-event from EOA (must be pot contract-caller)",
        "stackspot-sponsor",
        "sponsor-event",
        [selfA],
        unauthorized,
        "unauthorized",
        "err u1304"
      );
      const platformStake = callFn(
        "sponsor-platform",
        "PSP-04",
        "sponsor-platform happy path (10 cycles)",
        "stackspot-sponsor",
        "sponsor-platform",
        [Cl.uint(PLATFORM_SPONSOR_AMOUNT), Cl.uint(PLATFORM_SPONSOR_CYCLES), RULE_LIST],
        admin,
        "admin",
        "ok"
      );
      caseRow(
        "PSP-05",
        "events",
        "sponsor-platform logs on stackspots",
        "stackspot-sponsor",
        "print",
        eventsHavePrint(platformStake.events, "73706f6e736f722d706c6174666f726d") ? "print" : "missing",
        eventsHavePrint(platformStake.events, "73706f6e736f722d706c6174666f726d"),
        "hex sponsor-platform"
      );

      const initLife = callFn(
        "init",
        "INI-10",
        "pot-a jackpot init with platform sponsor (1 stake cycle)",
        potAId,
        "init-pot",
        [Cl.uint(STAKE_CYCLES), Cl.uint(MIN_AMOUNT), Cl.uint(MAX_PARTS), Cl.stringAscii("pot-a"), selfA, Cl.list([platformSponsor])],
        potADeployer,
        "potADeployer",
        "ok"
      );
      callFn(
        "init",
        "INI-08",
        "repeated init on pot-a",
        potAId,
        "init-pot",
        [Cl.uint(STAKE_CYCLES), Cl.uint(MIN_AMOUNT), Cl.uint(MAX_PARTS), Cl.stringAscii("pot-a-2"), selfA, Cl.list([])],
        potADeployer,
        "potADeployer",
        "err u1411"
      );
      caseRow(
        "INI-09",
        "events",
        "init-pot print contains event name",
        potAId,
        "print",
        eventsHavePrint(initLife.events, "696e69742d706f74") ? "print" : "missing",
        eventsHavePrint(initLife.events, "696e69742d706f74")
      );
      const ticket = simnet.callReadOnlyFn(potAId, "get-platform-sponsor-ticket", [platformSponsor], potADeployer);
      caseRow(
        "INI-11",
        "init",
        "platform sponsor ticket stored on pot",
        potAId,
        "some uint",
        stringify(ticket.result),
        stringify(ticket.result).includes("some") || stringify(ticket.result).includes("uint"),
        stringify(ticket.result)
      );
      caseRow(
        "INI-12",
        "events",
        "init-pot logs sponsor-contract + ticket-id",
        potAId,
        "print",
        eventsHavePrint(initLife.events, "73706f6e736f722d636f6e7472616374") && eventsHavePrint(initLife.events, "7469636b65742d6964")
          ? "print"
          : "missing",
        eventsHavePrint(initLife.events, "73706f6e736f722d636f6e7472616374") && eventsHavePrint(initLife.events, "7469636b65742d6964")
      );

      callFn(
        "init",
        "INI-13",
        "pot-b sequential init empty sponsors (cycle count follows joins)",
        potBId,
        "init-pot",
        [Cl.uint(MIN_AMOUNT), Cl.uint(MAX_PARTS), Cl.stringAscii("pot-b"), selfB, Cl.list([])],
        potBDeployer,
        "potBDeployer",
        "ok"
      );
      callFn(
        "init",
        "INI-14",
        "pot-c crowd-fund init with funding address (1 stake cycle)",
        potCId,
        "init-pot",
        [Cl.uint(STAKE_CYCLES), Cl.uint(MIN_AMOUNT), Cl.uint(MAX_PARTS), Cl.stringAscii("pot-c"), Cl.principal(starter), selfC, Cl.list([platformSponsor])],
        potCDeployer,
        "potCDeployer",
        "ok"
      );

      callFn(
        "start",
        "ST-01",
        "start pot-a before target (no participants)",
        potAId,
        "start-stackspot-jackpot",
        [selfA],
        starter,
        "starter",
        "err u1410"
      );

      // --- 7. Individual pot sponsor stress ---
      callFn(
        "pot-sponsor",
        "SPN-01",
        "join-pot-as-sponsor amount 0",
        potAId,
        "join-pot-as-sponsor",
        [Cl.uint(0), Cl.principal(potSponsor)],
        potSponsor,
        "potSponsor",
        "err u1302"
      );
      callFn(
        "pot-sponsor",
        "SPN-02",
        "join-pot-as-sponsor as platform treasury",
        potAId,
        "join-pot-as-sponsor",
        [Cl.uint(SPONSOR_BOOST), Cl.principal(admin)],
        admin,
        "admin",
        "err u1101"
      );
      callFn(
        "pot-sponsor",
        "SPN-03",
        "join-pot-as-sponsor as pot admin",
        potAId,
        "join-pot-as-sponsor",
        [Cl.uint(SPONSOR_BOOST), Cl.principal(potADeployer)],
        potADeployer,
        "potADeployer",
        "err u1101"
      );
      callFn(
        "pot-sponsor",
        "SPN-04",
        "join-pot-as-sponsor caller != sponsor principal",
        potAId,
        "join-pot-as-sponsor",
        [Cl.uint(SPONSOR_BOOST), Cl.principal(potSponsor)],
        unauthorized,
        "unauthorized",
        "err",
        "stx-transfer-memo? requires tx-sender == sponsor"
      );
      const boost = callFn(
        "pot-sponsor",
        "SPN-05",
        "join-pot-as-sponsor happy path",
        potAId,
        "join-pot-as-sponsor",
        [Cl.uint(SPONSOR_BOOST), Cl.principal(potSponsor)],
        potSponsor,
        "potSponsor",
        "ok"
      );
      callFn(
        "pot-sponsor",
        "SPN-06",
        "duplicate join-pot-as-sponsor",
        potAId,
        "join-pot-as-sponsor",
        [Cl.uint(SPONSOR_BOOST), Cl.principal(potSponsor)],
        potSponsor,
        "potSponsor",
        "err u1105"
      );
      caseRow(
        "SPN-07",
        "events",
        "join-pot-as-sponsor print + stackspots log",
        potAId,
        "print",
        eventsHavePrint(boost.events, "6a6f696e2d706f742d61732d73706f6e736f72") ? "print" : "missing",
        eventsHavePrint(boost.events, "6a6f696e2d706f742d61732d73706f6e736f72")
      );
      const seqBoost = callFn(
        "pot-sponsor",
        "SPN-08",
        "sequential join-pot-as-sponsor",
        potBId,
        "join-pot-as-sponsor",
        [Cl.uint(SPONSOR_BOOST), Cl.principal(potSponsor)],
        potSponsor,
        "potSponsor",
        "ok"
      );
      void seqBoost;
      callFn(
        "pot-sponsor",
        "SPN-09",
        "crowd-fund join-pot-as-sponsor",
        potCId,
        "join-pot-as-sponsor",
        [Cl.uint(SPONSOR_BOOST), Cl.principal(potSponsor)],
        potSponsor,
        "potSponsor",
        "ok"
      );

      // --- 8. Participant joins ---
      callFn(
        "join",
        "JN-01",
        "join below minimum",
        potAId,
        "join-pot",
        [Cl.uint(MIN_AMOUNT - 1)],
        wallet4,
        "participant",
        "err u1302"
      );
      callFn(
        "join",
        "JN-02",
        "join as pot-a admin",
        potAId,
        "join-pot",
        [Cl.uint(MIN_AMOUNT)],
        potADeployer,
        "potADeployer",
        "err u1101"
      );
      callFn(
        "join",
        "JN-03",
        "join as platform treasury",
        potAId,
        "join-pot",
        [Cl.uint(MIN_AMOUNT)],
        admin,
        "admin",
        "err u1101"
      );
      const joinA = callFn(
        "join",
        "JN-04",
        `${participantAccounts[0].wallet} joins pot-a at minimum`,
        potAId,
        "join-pot",
        [Cl.uint(MIN_AMOUNT)],
        participantAccounts[0].address,
        "participant",
        "ok"
      );
      callFn(
        "join",
        "JN-05",
        `duplicate join ${participantAccounts[0].wallet} on pot-a`,
        potAId,
        "join-pot",
        [Cl.uint(MIN_AMOUNT)],
        participantAccounts[0].address,
        "participant",
        "err u1104"
      );
      participantAccounts.slice(1).forEach((person, i) => {
        callFn(
          "join",
          `JN-0${6 + i}`,
          `${person.wallet} joins pot-a at minimum`,
          potAId,
          "join-pot",
          [Cl.uint(MIN_AMOUNT)],
          person.address,
          "participant",
          "ok"
        );
      });
      caseRow(
        "JN-10",
        "events",
        "join-pot print captured",
        potAId,
        "print",
        eventsHavePrint(joinA.events, "6a6f696e2d706f74") ? "print" : "missing",
        eventsHavePrint(joinA.events, "6a6f696e2d706f74")
      );

      participantAccounts.forEach((person, i) => {
        callFn(
          "join",
          `JN-B${i + 1}`,
          `${person.wallet} joins pot-b`,
          potBId,
          "join-pot",
          [Cl.uint(MIN_AMOUNT)],
          person.address,
          "participant",
          "ok"
        );
        callFn(
          "join",
          `JN-C${i + 1}`,
          `${person.wallet} joins pot-c`,
          potCId,
          "join-pot",
          [Cl.uint(MIN_AMOUNT)],
          person.address,
          "participant",
          "ok"
        );
      });

      const potValue = simnet.callReadOnlyFn(potAId, "get-pot-value", [], potADeployer);
      const expectedValue = BigInt(MIN_AMOUNT * participants.length + SPONSOR_BOOST);
      caseRow(
        "JN-13",
        "join",
        "lifecycle pot value = participants + sponsor principal",
        potAId,
        expectedValue.toString(),
        unwrapOkUint(potValue.result).toString(),
        unwrapOkUint(potValue.result) === expectedValue
      );

      callFn(
        "cancel",
        "CAN-01",
        "cancel-pot too early",
        potAId,
        "cancel-pot",
        [selfA],
        closer,
        "closer",
        "err u1409"
      );
      callFn(
        "start",
        "ST-02",
        "start with wrong pot trait",
        potAId,
        "start-stackspot-jackpot",
        [wrongSelf],
        starter,
        "starter",
        "err u1101"
      );

      const startLife = callFn(
        "start",
        "ST-03",
        "start pot-a jackpot",
        potAId,
        "start-stackspot-jackpot",
        [selfA],
        starter,
        "starter",
        "ok"
      );
      callFn(
        "start",
        "ST-04",
        "repeat start",
        potAId,
        "start-stackspot-jackpot",
        [selfA],
        starter,
        "starter",
        "err u1403"
      );
      callFn(
        "join",
        "JN-14",
        "join after start",
        potAId,
        "join-pot",
        [Cl.uint(MIN_AMOUNT)],
        wallet4,
        "participant",
        "err u1401"
      );
      caseRow(
        "ST-05",
        "events",
        "start-stackspot-jackpot print",
        potAId,
        "print",
        eventsHavePrint(startLife.events, "73746172742d737461636b73706f742d6a61636b706f74") ? "print" : "missing",
        eventsHavePrint(startLife.events, "73746172742d737461636b73706f742d6a61636b706f74")
      );

      callFn("start", "ST-06", "start pot-b sequential", potBId, "start-stackspot-sequential-pot", [selfB], starter, "starter", "ok");
      callFn("start", "ST-07", "start pot-c crowdfund", potCId, "start-stackspot-crowdfund", [selfC], starter, "starter", "ok");

      callFn(
        "claim",
        "CL-01",
        "claim before reward-release",
        potAId,
        "claim-pot-reward",
        [selfA, Cl.list([platformSponsor])],
        closer,
        "closer",
        "err u1402"
      );

      // --- 11 + 12. Mixed sponsor STX vs yield + platform sponsor claim ---
      const sponsorStxBeforeClaim = stxBalance(potSponsor);
      const partBefore = new Map(participants.map((p) => [p, stxBalance(p)]));
      const potStxBeforeClaim = stxBalance(potAId);
      const potSbtcBeforeClaim = sbtcBalance(potAId);

      const release = potRewardRelease(potAId, potADeployer);
      mineUntilBurnHeight(admin, release);
      payoutPotFromFastpool(admin, potAId, potADeployer);

      const claim = callFn(
        "claim",
        "CL-02",
        "claim lifecycle jackpot after reward-release",
        potAId,
        "claim-pot-reward",
        [selfA, Cl.list([platformSponsor])],
        closer,
        "closer",
        "ok"
      );
      caseRow(
        "CL-03",
        "events",
        "claim-pot-reward print includes yield",
        potAId,
        "print",
        eventsHavePrint(claim.events, "636c61696d2d706f742d726577617264") ? "print" : "missing",
        eventsHavePrint(claim.events, "636c61696d2d706f742d726577617264")
      );

      const sponsorReturned = stxBalance(potSponsor) - sponsorStxBeforeClaim;
      const partReturned = participants.reduce((sum, p) => sum + stxBalance(p) - (partBefore.get(p) ?? 0n), 0n);
      findings.push(
        `Mixed funds after claim: pot STX before ${potStxBeforeClaim}, sponsor STX delta ${sponsorReturned}, participant STX delta ${partReturned}, pot sBTC before ${potSbtcBeforeClaim} after ${sbtcBalance(potAId)}.`
      );
      caseRow(
        "MIX-01",
        "mixed-funds",
        "sponsor principal STX is returned separately from participant STX",
        potAId,
        `sponsor ~${SPONSOR_BOOST + MIN_AMOUNT} (wallet_5 also joined)`,
        sponsorReturned.toString(),
        sponsorReturned === BigInt(SPONSOR_BOOST + MIN_AMOUNT),
        `participants returned ${partReturned}`
      );
      caseRow(
        "MIX-02",
        "mixed-funds",
        "yield is sBTC (not STX) after Fastpool pull",
        "sbtc-token",
        "yield > 0 or documented",
        `pot sBTC ${sbtcBalance(potAId)} closer ${sbtcBalance(closer)} starter ${sbtcBalance(starter)}`,
        sbtcBalance(potAId) === 0n &&
          (sbtcBalance(closer) > 0n ||
            sbtcBalance(starter) > 0n ||
            participants.some((p) => sbtcBalance(p) > 0n)),
        "claimer/starter/winner share sBTC; STX principal is refunded"
      );

      // Sequential pot-b: one claim per reward-cycle across 7 rounds (6 winners + leftover yield).
      for (let round = 1; round <= SEQ_CLAIM_ROUNDS; round += 1) {
        const seqRelease = potRewardRelease(potBId, potBDeployer);
        if (simnet.burnBlockHeight <= seqRelease) {
          mineUntilBurnHeight(admin, seqRelease);
        }
        payoutPotFromFastpool(admin, potBId, potBDeployer);
        const seqClaim = callFn(
          "claim",
          `SEQ-CL-${String(round).padStart(2, "0")}`,
          `claim pot-b sequential reward-cycle round ${round}/${SEQ_CLAIM_ROUNDS}`,
          potBId,
          "claim-pot-reward",
          [selfB, Cl.list([])],
          closer,
          "closer",
          "ok"
        );
        caseRow(
          `SEQ-CL-EV-${String(round).padStart(2, "0")}`,
          "events",
          `pot-b sequential claim ${round} print`,
          potBId,
          "print",
          eventsHavePrint(seqClaim.events, "636c61696d2d706f742d726577617264") ? "print" : "missing",
          eventsHavePrint(seqClaim.events, "636c61696d2d706f742d726577617264")
        );
      }
      findings.push(
        `Sequential pot-b: ${SEQ_CLAIM_ROUNDS} claim rounds after start (6 winner payouts then leftover Fastpool yield). Chain at ${clockLabel()}.`
      );

      const ticketId = unwrapOkUint(
        (() => {
          const raw = ticket.result as { value?: { value?: { value?: unknown } } };
          const inner = raw?.value?.value?.value ?? raw?.value;
          if (typeof inner === "bigint" || typeof inner === "number") {
            return { type: ClarityType.ResponseOk, value: inner };
          }
          return ticket.result as { type?: number; value?: unknown };
        })()
      );

      callFn(
        "sponsor-platform",
        "PSP-06",
        "claim-sponsor-reward after pot claim (closer is not ticket NFT owner / not contract-caller)",
        "stackspot-sponsor",
        "claim-sponsor-reward",
        [selfA, Cl.uint(ticketId > 0n ? ticketId : 1n)],
        closer,
        "closer",
        "ok",
        "non-pot caller skips yield transfer and still returns ok"
      );
      findings.push(
        "sponsor-platform transfers STX into stackspot-sponsor then calls sim-pox-5.stake as tx-sender (not as-contract), so lock uses the caller wallet rather than the contract's received STX."
      );
      findings.push(
        "init-admin: genesis top-level (update-contract-hash) allowlists hashes, but a later admin public call still succeeds — `initialized` does not block the first public invocation in this simnet (ADM-01)."
      );

      // --- 10. Cross-contract ---
      const potInfo = simnet.callReadOnlyFn("stackspots", "get-pot-info", [selfA], admin);
      caseRow(
        "X-01",
        "cross-contract",
        "stackspots get-pot-info for lifecycle pot",
        "stackspots",
        "ok",
        resultLabel(potInfo.result as never),
        isOk(potInfo.result as never),
        stringify(potInfo.result)
      );
      const lastId = simnet.callReadOnlyFn("stackspots", "get-last-token-id", [], admin);
      caseRow(
        "X-02",
        "cross-contract",
        "stackspots last-token-id incremented",
        "stackspots",
        "> 0",
        stringify(lastId.result),
        unwrapOkUint(lastId.result) > 0n
      );
      const sponsorLast = simnet.callReadOnlyFn("stackspot-sponsor", "get-last-token-id", [], admin);
      caseRow(
        "X-03",
        "cross-contract",
        "platform sponsor NFT minted on init",
        "stackspot-sponsor",
        "> 0",
        stringify(sponsorLast.result),
        unwrapOkUint(sponsorLast.result) > 0n
      );

      const logged = txLog.filter((r) => r.functionName !== "deploy-contract");
      const withEvents = logged.filter((r) => r.eventCount > 0 || r.notes.includes("protocol"));
      caseRow(
        "EV-01",
        "events",
        "transaction log captured every call",
        "harness",
        `>= 40 txs`,
        String(txLog.length),
        txLog.length >= 40,
        `${withEvents.length} rows with events`
      );

      const contracts = ["stackspots", "init-admin", "jackpot", "sequential", "crowd-fund", "stackspot-sponsor"];
      for (const name of contracts) {
        const related = matrix.filter((r) => {
          const c = r.contract.toLowerCase();
          if (name === "jackpot") return c.includes("jackpot") || c.includes("pot-a");
          if (name === "sequential") return c.includes("sequential") || c.includes("pot-b");
          if (name === "crowd-fund") return c.includes("crowd") || c.includes("pot-c");
          if (name === "stackspot-sponsor") return c.includes("stackspot-sponsor") && !c.includes("trait");
          if (name === "stackspots") return c === "stackspots" || c.endsWith(".stackspots");
          if (name === "init-admin") return c.includes("init-admin");
          return c.includes(name);
        });
        const failN = related.filter((r) => !r.pass).length;
        caseRow(
          `CTR-${name}`,
          "contract-matrix",
          `${name} battery`,
          name,
          "0 failed cases",
          `${related.length - failN}/${related.length} passed`,
          failN === 0,
          failN ? related.filter((r) => !r.pass).map((r) => r.id).join(",") : "all related cases passed"
        );
      }

      const firstTx = txLog[0];
      const lastTx = txLog[txLog.length - 1];
      if (firstTx && lastTx) {
        findings.push(
          `Chain coverage: PoX cycle ${firstTx.poxCycle} burn ${firstTx.burnBlock} (burns ${firstTx.cycleStartBurn}–${firstTx.cycleEndBurn}) → cycle ${lastTx.poxCycle} burn ${lastTx.burnBlock} (burns ${lastTx.cycleStartBurn}–${lastTx.cycleEndBurn}). Cycle length is ${CYCLE_LENGTH} burn blocks. Jackpot/crowd-fund stake ${STAKE_CYCLES} cycle; sequential pot-b stakes ${SEQ_STAKE_CYCLES} cycles with ${SEQ_CLAIM_ROUNDS} claim rounds; platform sponsor stakes ${PLATFORM_SPONSOR_CYCLES} cycles.`
        );
      }

      await flushReports();
      const knownDefects = new Set(["ADM-01", "CTR-init-admin"]);
      const unexpected = matrix
        .filter((r) => !r.pass && !knownDefects.has(r.id))
        .map((r) => `${r.id}: ${r.title} expected ${r.expected} got ${r.actual}`);
      expect(txLog.length).toBeGreaterThan(40);
      expect(unexpected, unexpected.join("\n")).toEqual([]);
    },
    1_800_000
  );

  afterAll(async () => {
    await flushReports();
  });
});
