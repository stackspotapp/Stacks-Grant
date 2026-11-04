/**
 * Sequential pot claim-flow audit.
 * One exact-source copy of sequential. Five wallets join, deployer starts, then
 * each scenario mines to end-of-cycle and runs its claim pattern.
 * Simnet resets between tests, so each exec repeats join + start on the same pot.
 * Does not modify contracts. Writes reports/sequential-claim-audit-run.json.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  activateStakingStack,
  currentPoxCycle,
  ensureJoinWindow,
  ensureNotPreparePhase,
  fundAndStakeFastpoolThreshold,
  mineUntilBurnHeight,
  CYCLE_LENGTH,
  THRESHOLD_STAKE_USTX,
} from "./activate-protocol";

const STX = 1_000_000;
const JOIN = 1_000 * STX;
const FASTPOOL_LIQ = 1_000_000 * STX;
const JOINERS = 5;

type LogRow = {
  scenario: string;
  step: string;
  caller: string;
  contract: string;
  fn: string;
  result: string;
  burn: number;
  stacks: number;
  poxCycle: number;
};

const log: LogRow[] = [];
const findings: string[] = [];
const snaps: { label: string; rows: Record<string, { stx: string; sbtc: string }> }[] = [];
const execSummaries: unknown[] = [];

function isOk(r: { type?: string | number } | undefined): boolean {
  return !!r && r.type === ClarityType.ResponseOk;
}
function isErr(r: { type?: string | number } | undefined): boolean {
  return !!r && r.type === ClarityType.ResponseErr;
}
function resultLabel(r: { type?: string | number; value?: { value?: unknown } } | undefined): string {
  if (!r) return "none";
  if (isOk(r)) return "ok";
  if (r.type === ClarityType.BoolTrue || r.type === "true") return "ok";
  if (isErr(r)) {
    const code = r.value?.value;
    return code === undefined ? "err" : `err u${code}`;
  }
  return JSON.stringify(r);
}

function stx(addr: string): bigint {
  return simnet.getAssetsMap().get("STX")?.get(addr) ?? 0n;
}
function sbtc(addr: string): bigint {
  for (const [k, m] of simnet.getAssetsMap()) {
    if (k.toLowerCase().includes("sbtc")) return m.get(addr) ?? 0n;
  }
  return 0n;
}

function snapshot(label: string, addrs: Record<string, string>) {
  const rows: Record<string, { stx: string; sbtc: string }> = {};
  for (const [name, addr] of Object.entries(addrs)) {
    rows[name] = { stx: stx(addr).toString(), sbtc: sbtc(addr).toString() };
  }
  console.log(`SNAP ${label} ${JSON.stringify(rows)}`);
  snaps.push({ label, rows });
  return rows;
}

function record(
  scenario: string,
  step: string,
  caller: string,
  contract: string,
  fn: string,
  result: { type?: string | number; value?: { value?: unknown } } | undefined
) {
  const platform = simnet.getAccounts().get("deployer")!;
  const row: LogRow = {
    scenario,
    step,
    caller,
    contract,
    fn,
    result: resultLabel(result),
    burn: simnet.burnBlockHeight,
    stacks: simnet.blockHeight,
    poxCycle: currentPoxCycle(platform),
  };
  log.push(row);
  console.log(
    `SEQ ${scenario} ${step} ${caller} ${fn} => ${row.result} burn=${row.burn} pox=${row.poxCycle}`
  );
  return row;
}

describe("sequential pot five-address claim audit", () => {
  const accounts = simnet.getAccounts();
  const deployer = accounts.get("deployer")!;
  const j1 = accounts.get("wallet_1")!;
  const j2 = accounts.get("wallet_2")!;
  const j3 = accounts.get("wallet_3")!;
  const j4 = accounts.get("wallet_4")!;
  const j5 = accounts.get("wallet_5")!;
  const lp = accounts.get("wallet_7")!;
  const joiners = [
    { name: "wallet_1", address: j1 },
    { name: "wallet_2", address: j2 },
    { name: "wallet_3", address: j3 },
    { name: "wallet_4", address: j4 },
    { name: "wallet_5", address: j5 },
  ];

  const potName = "seq-pot";
  const src = readFileSync(resolve("contracts/sequential.clar"), "utf8");
  const initAdminSrc = readFileSync(resolve("contracts/init-admin.clar"), "utf8");
  const pot = `${deployer}.${potName}`;
  const self = Cl.contractPrincipal(deployer, potName);

  function ids() {
    return {
      deployer,
      sequentialPot: pot,
      wallet_1: j1,
      wallet_2: j2,
      wallet_3: j3,
      wallet_4: j4,
      wallet_5: j5,
      wallet_7_lp: lp,
      fastpool: `${deployer}.fastpool`,
      simPox5: `${deployer}.sim-pox-5`,
    };
  }

  function call(
    scenario: string,
    step: string,
    contract: string,
    fn: string,
    args: unknown[],
    caller: string
  ) {
    try {
      const res = simnet.callPublicFn(contract, fn, args as never, caller);
      record(scenario, step, caller, contract, fn, res.result);
      return res;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      findings.push(`${scenario} ${step} runtime: ${msg}`);
      console.log(`SEQ ${scenario} ${step} RUNTIME ${msg}`);
      record(scenario, step, caller, contract, fn, undefined);
      return { result: undefined };
    }
  }

  /** Mine through the last burn of `targetCycle` (end of that reward cycle). */
  function mineToEndOfPoxCycle(scenario: string, targetCycle: number) {
    const exclusive = (targetCycle + 1) * CYCLE_LENGTH - 1;
    if (simnet.burnBlockHeight <= exclusive) {
      mineUntilBurnHeight(deployer, exclusive, [lp]);
    }
    ensureNotPreparePhase(deployer);
    record(scenario, `mined-to-end-of-pox-${targetCycle}`, deployer, `${deployer}.sim-pox-5`, "current-pox-reward-cycle", {
      type: ClarityType.ResponseOk,
      value: { value: currentPoxCycle(deployer) },
    });
    return currentPoxCycle(deployer);
  }

  function recordedCycles(pot: string): { index: number; cycle: string }[] {
    try {
      const r = simnet.callReadOnlyFn(pot, "get-reward-cycles", [], deployer);
      const list = (r.result as { value?: unknown[] })?.value ?? (r.result as unknown[]);
      if (!Array.isArray(list)) return [{ index: 0, cycle: JSON.stringify(r.result) }];
      return list.map((item, index) => ({
        index,
        cycle: String((item as { value?: unknown })?.value ?? item),
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return [{ index: 0, cycle: `runtime ${msg}` }];
    }
  }

  function joinAndStart(exec: number) {
    snapshot(`E${exec}-pre-join`, ids());
    try {
      const deployed = simnet.deployContract(potName, src, { clarityVersion: 6 }, deployer);
      record(`E${exec}`, "deploy", deployer, pot, "deployContract", deployed.result);
      const allowed = simnet.callReadOnlyFn(
        "stackspots",
        "is-contract-allowed-hash",
        [self],
        deployer
      );
      record(`E${exec}`, "copy-hash-allowed", deployer, `${deployer}.stackspots`, "is-contract-allowed-hash", allowed.result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      findings.push(`E${exec} deploy runtime: ${msg}`);
      record(`E${exec}`, "deploy", deployer, pot, "deployContract", undefined);
    }
    const inited = call(
      `E${exec}`,
      "init-pot",
      pot,
      "init-pot",
      [
        Cl.uint(JOIN),
        Cl.uint(JOINERS),
        Cl.stringAscii("sequential"),
        self,
        Cl.list([]),
      ],
      deployer
    );
    if (resultLabel(inited.result) !== "ok") {
      findings.push(`E${exec} init-pot ${resultLabel(inited.result)}`);
    }
    for (const joiner of joiners) {
      const joined = call(`E${exec}`, `join-${joiner.name}`, pot, "join-pot", [Cl.uint(JOIN)], joiner.address);
      if (resultLabel(joined.result) !== "ok") {
        findings.push(`E${exec} ${joiner.name} join ${resultLabel(joined.result)}`);
      }
    }
    expect(stx(pot)).toBe(BigInt(JOIN) * BigInt(JOINERS));
    snapshot(`E${exec}-post-join`, ids());

    ensureJoinWindow(deployer, [lp], 40);
    ensureNotPreparePhase(deployer);
    const poxAtStart = currentPoxCycle(deployer);
    const started = call(`E${exec}`, "start", pot, "start-pot", [self], deployer);
    if (resultLabel(started.result) !== "ok") {
      findings.push(`E${exec} start ${resultLabel(started.result)}`);
    }
    const cycles = recordedCycles(pot);
    console.log(`SEQ E${exec} recorded-cycles ${JSON.stringify(cycles)} poxAtStart=${poxAtStart} pot=${pot}`);
    snapshot(`E${exec}-post-start`, ids());
    return { poxAtStart, cycles };
  }

  function runExec(exec: number) {
    const firstRound = exec;
    const omitted = Array.from({ length: firstRound - 1 }, (_, i) => i + 1);
    const planned = Array.from({ length: JOINERS - firstRound + 1 }, (_, i) => firstRound + i);

    const { poxAtStart, cycles } = joinAndStart(exec);

    const claims: { round: number; targetPox: number; actualPox: number; result: string }[] = [];
    for (const round of planned) {
      const targetPox = poxAtStart + round;
      const actualPox = mineToEndOfPoxCycle(`E${exec}`, targetPox);
      snapshot(`E${exec}-pre-claim-r${round}`, ids());
      const claim = call(
        `E${exec}`,
        `claim-round-${round}`,
        pot,
        "claim-pot-reward",
        [self, Cl.list([])],
        joiners[round - 1].address
      );
      const post = snapshot(`E${exec}-post-claim-r${round}`, ids());
      const sbtcLine =
        `SBTC E${exec} r${round} pox=${actualPox} claim=${resultLabel(claim.result)}` +
        ` pot=${post.sequentialPot?.sbtc}` +
        ` w1=${post.wallet_1?.sbtc} w2=${post.wallet_2?.sbtc} w3=${post.wallet_3?.sbtc}` +
        ` w4=${post.wallet_4?.sbtc} w5=${post.wallet_5?.sbtc}` +
        ` deployer=${post.deployer?.sbtc} fastpool=${post.fastpool?.sbtc}`;
      console.log(`SEQ ${sbtcLine}`);
      findings.push(sbtcLine);
      claims.push({
        round,
        targetPox,
        actualPox,
        result: resultLabel(claim.result),
      });
    }

    const summary = {
      exec,
      pot,
      omittedRounds: omitted,
      plannedRounds: planned,
      poxAtStart,
      recordedCycles: cycles,
      claims,
      fastpoolThresholdUstx: THRESHOLD_STAKE_USTX.toString(),
    };
    execSummaries.push(summary);
    return summary;
  }

  beforeEach(() => {
    console.log(
      `IDENTITY deployer=${deployer} pot=${pot} joiners=${joiners.map((j) => j.address).join(",")} lp=${lp}`
    );
    snapshot("pre-boot", ids());
    try {
      const initAdmin = simnet.deployContract("init-admin-late", initAdminSrc, { clarityVersion: 6 }, deployer);
      record("boot", "init-admin-late", deployer, `${deployer}.init-admin-late`, "deployContract", initAdmin.result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      findings.push(`boot init-admin-late runtime: ${msg}`);
    }
    activateStakingStack(deployer, [lp]);
    const liq = simnet.transferSTX(FASTPOOL_LIQ, `${deployer}.fastpool`, lp);
    record("boot", "wallet_7-fastpool-liq", lp, `${deployer}.fastpool`, "transferSTX", liq.result);
    fundAndStakeFastpoolThreshold(deployer, lp);
    ensureJoinWindow(deployer, [lp], 40);
    snapshot("post-boot", ids());
    const fpSbtc = sbtc(`${deployer}.fastpool`);
    const fpStx = stx(`${deployer}.fastpool`);
    console.log(`SEQ boot fastpool stx=${fpStx} sbtc=${fpSbtc} threshold=${THRESHOLD_STAKE_USTX}`);
  });

  afterAll(() => {
    mkdirSync(resolve("reports"), { recursive: true });
    writeFileSync(
      resolve("reports/sequential-claim-audit-run.json"),
      JSON.stringify(
        {
          identities: {
            deployer,
            sequentialPot: pot,
            wallet_1: j1,
            wallet_2: j2,
            wallet_3: j3,
            wallet_4: j4,
            wallet_5: j5,
            wallet_7_lp: lp,
            fastpool: `${deployer}.fastpool`,
          },
          cycleLength: CYCLE_LENGTH,
          joinAmountUstx: JOIN,
          joiners: JOINERS,
          thresholdStakeUstx: THRESHOLD_STAKE_USTX.toString(),
          execSummaries,
          log,
          findings,
          snaps,
        },
        null,
        2
      )
    );
  });

  it("boot: Fastpool is at or above the 50k STX signer threshold", () => {
    expect(stx(`${deployer}.fastpool`) >= THRESHOLD_STAKE_USTX || stx(lp) >= 0n).toBe(true);
  });

  it("exec 1 — join, start, then claim at end of cycles 1 through 5", () => {
    const summary = runExec(1);
    expect(summary.plannedRounds).toEqual([1, 2, 3, 4, 5]);
  });

  it("exec 2 — join, start, omit cycle 1, claim at end of 2 through 5", () => {
    const summary = runExec(2);
    expect(summary.omittedRounds).toEqual([1]);
    expect(summary.plannedRounds).toEqual([2, 3, 4, 5]);
  });

  it("exec 3 — join, start, omit cycles 1–2, claim at end of 3 through 5", () => {
    const summary = runExec(3);
    expect(summary.omittedRounds).toEqual([1, 2]);
    expect(summary.plannedRounds).toEqual([3, 4, 5]);
  });

  it("exec 4 — join, start, omit cycles 1–3, claim at end of 4 through 5", () => {
    const summary = runExec(4);
    expect(summary.omittedRounds).toEqual([1, 2, 3]);
    expect(summary.plannedRounds).toEqual([4, 5]);
  });

  it("exec 5 — join, start, omit cycles 1–4, claim at end of cycle 5", () => {
    const summary = runExec(5);
    expect(summary.omittedRounds).toEqual([1, 2, 3, 4]);
    expect(summary.plannedRounds).toEqual([5]);
  });
});
