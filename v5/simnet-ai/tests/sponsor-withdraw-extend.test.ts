/**
 * Platform-sponsor principal: withdraw-principal + extend-sponsor-platform.
 * Does not modify contracts. Writes reports/sponsor-withdraw-extend-run.json.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  activateStakingStack,
  ensureJoinWindow,
  fundAndStakeFastpoolThreshold,
  mineUntilBurnHeight,
  CYCLE_LENGTH,
} from "./activate-protocol";

const STX = 1_000_000;
const AMOUNT = 40 * STX;
const WITHDRAW = 10 * STX;
const FASTPOOL_LIQ = 1_000_000 * STX;
const STAKE_CYCLES = 1;

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

type LogRow = {
  scenario: string;
  step: string;
  caller: string;
  contract: string;
  fn: string;
  result: string;
  burn: number;
  stacks: number;
};

const log: LogRow[] = [];
const findings: string[] = [];
const snaps: { label: string; rows: Record<string, { stx: string; sbtc: string }> }[] = [];

function isOk(r: { type?: string | number } | undefined): boolean {
  return !!r && r.type === ClarityType.ResponseOk;
}
function isErr(r: { type?: string | number } | undefined): boolean {
  return !!r && r.type === ClarityType.ResponseErr;
}
function resultLabel(r: { type?: string | number; value?: { value?: unknown } } | undefined): string {
  if (!r) return "none";
  if (isOk(r)) return "ok";
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

function unwrapOk(cv: unknown): unknown {
  if (cv && typeof cv === "object" && "type" in cv) {
    const rec = cv as { type: string | number; value?: unknown };
    if (rec.type === ClarityType.ResponseOk || rec.type === "ok") return rec.value;
  }
  return cv;
}

function tupleFromCv(cv: unknown): Record<string, unknown> {
  const inner = unwrapOk(cv);
  if (inner && typeof inner === "object" && "type" in inner) {
    const rec = inner as { type: string | number; value?: unknown };
    if (rec.type === ClarityType.Tuple || rec.type === "tuple") {
      const v = rec.value;
      if (v && typeof v === "object" && "data" in v) return (v as { data: Record<string, unknown> }).data;
      return (v ?? {}) as Record<string, unknown>;
    }
  }
  if (inner && typeof inner === "object" && "data" in inner) {
    return (inner as { data: Record<string, unknown> }).data;
  }
  throw new Error(`expected tuple, got ${JSON.stringify(cv)}`);
}

function asBool(cv: unknown): boolean {
  if (typeof cv === "boolean") return cv;
  if (cv && typeof cv === "object" && "type" in cv) {
    const t = (cv as { type: string | number }).type;
    if (t === ClarityType.BoolTrue || t === "true") return true;
    if (t === ClarityType.BoolFalse || t === "false") return false;
  }
  throw new Error(`expected bool, got ${JSON.stringify(cv)}`);
}

function uintFromCv(cv: unknown): bigint {
  if (typeof cv === "bigint") return cv;
  if (typeof cv === "number") return BigInt(cv);
  if (typeof cv === "string" && /^\d+$/.test(cv)) return BigInt(cv);
  if (cv && typeof cv === "object" && "value" in cv) return uintFromCv((cv as { value: unknown }).value);
  throw new Error(`expected uint, got ${JSON.stringify(cv)}`);
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
  const row: LogRow = {
    scenario,
    step,
    caller,
    contract,
    fn,
    result: resultLabel(result),
    burn: simnet.burnBlockHeight,
    stacks: simnet.blockHeight,
  };
  log.push(row);
  console.log(`SP ${scenario} ${step} ${caller} ${fn} => ${row.result} burn=${row.burn}`);
  return row;
}

describe("platform sponsor withdraw + extend", () => {
  const accounts = simnet.getAccounts();
  const platform = accounts.get("deployer")!;
  const extra = accounts.get("wallet_8")!;
  const p1 = accounts.get("wallet_3")!;
  const lp = accounts.get("wallet_7")!;
  const sponsorId = `${platform}.stackspot-sponsor`;

  const ids = {
    platform,
    extra,
    stackspot_sponsor: sponsorId,
  };
  const initAdminSrc = readFileSync(resolve("contracts/init-admin.clar"), "utf8");

  function call(
    scenario: string,
    step: string,
    fn: string,
    args: unknown[],
    caller: string
  ) {
    try {
      const res = simnet.callPublicFn("stackspot-sponsor", fn, args as never, caller);
      record(scenario, step, caller, sponsorId, fn, res.result);
      return res;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      findings.push(`${scenario} ${step} runtime: ${msg}`);
      console.log(`SP ${scenario} ${step} RUNTIME ${msg}`);
      record(scenario, step, caller, sponsorId, fn, undefined);
      return { result: undefined };
    }
  }

  function sponsorDetails() {
    const r = simnet.callReadOnlyFn("stackspot-sponsor", "get-sponsor-details", [], platform);
    const data = tupleFromCv(r.result);
    return {
      isLocked: asBool(data["is-locked"]),
      sponsored: uintFromCv(data["sponsored-amount-ustx"]),
    };
  }

  function recordLock(scenario: string, step: string) {
    const d = sponsorDetails();
    record(scenario, step, platform, sponsorId, `is-locked=${d.isLocked} sponsored=${d.sponsored}`, {
      type: ClarityType.ResponseOk,
      value: { value: d.isLocked ? 1 : 0 },
    });
    return d;
  }

  function mineUntilUnlocked(scenario: string) {
    let guard = 0;
    let d = recordLock(scenario, "lock-before-mine");
    while (d.isLocked && guard < 20) {
      mineUntilBurnHeight(platform, simnet.burnBlockHeight + CYCLE_LENGTH, [p1, lp]);
      d = recordLock(scenario, `lock-after-cycle-${guard}`);
      guard += 1;
    }
    if (d.isLocked) findings.push(`${scenario} still locked after ${guard} cycles`);
    return d;
  }

  beforeEach(() => {
    const initAdmin = simnet.deployContract("init-admin-late", initAdminSrc, { clarityVersion: 6 }, platform);
    record("boot", "deployer-init-admin-late", platform, `${platform}.init-admin-late`, "deployContract", initAdmin.result);
    activateStakingStack(platform, [p1, lp]);
    const liq = simnet.transferSTX(FASTPOOL_LIQ, `${platform}.fastpool`, lp);
    record("boot", "wallet_7-fastpool-liq", lp, `${platform}.fastpool`, "transferSTX", liq.result);
    fundAndStakeFastpoolThreshold(platform, lp);
    ensureJoinWindow(platform, [p1, lp], 40);
    snapshot("post-boot", ids);
  });

  afterAll(() => {
    mkdirSync(resolve("reports"), { recursive: true });
    writeFileSync(
      resolve("reports/sponsor-withdraw-extend-run.json"),
      JSON.stringify({ identities: ids, cycleLength: CYCLE_LENGTH, log, findings, snaps }, null, 2)
    );
  });

  it("W locked withdraw / extend fail; unlocked withdraw + extend", () => {
    snapshot("pre-sponsor-platform", { platform, extra, stackspotSponsor: sponsorId });
    const funded = call("W", "sponsor-platform", "sponsor-platform", [Cl.uint(AMOUNT), Cl.uint(STAKE_CYCLES), RULE_LIST], platform);
    expect(resultLabel(funded.result)).toBe("ok");
    const afterStake = recordLock("W", "after-sponsor-platform");
    findings.push(`W after-sponsor-platform is-locked=${afterStake.isLocked} sponsored=${afterStake.sponsored}`);

    const unauthW = call("W", "withdraw-unauth-after-stake", "withdraw-principal", [Cl.uint(WITHDRAW)], extra);
    expect(resultLabel(unauthW.result)).toBe("err u1304");
    const unauthE = call("W", "extend-unauth-after-stake", "extend-sponsor-platform", [Cl.uint(STAKE_CYCLES)], extra);
    expect(resultLabel(unauthE.result)).toBe("err u1304");

    if (afterStake.isLocked) {
      mineUntilUnlocked("W");
      ensureJoinWindow(platform, [p1, lp], 40);
    } else {
      findings.push("W stx-account.locked is 0 immediately after sim-pox-5 stake (unlock-burn-height u4200)");
    }
    const unlocked = recordLock("W", "pre-withdraw");
    findings.push(`W pre-withdraw is-locked=${unlocked.isLocked} sponsored=${unlocked.sponsored}`);

    const beforeWithdraw = stx(platform);
    const contractBefore = stx(sponsorId);
    snapshot("pre-withdraw", { platform, extra, stackspotSponsor: sponsorId });

    const full = call("W", "withdraw-full", "withdraw-principal", [Cl.uint(Number(unlocked.sponsored))], platform);
    findings.push(`W withdraw-full=${resultLabel(full.result)} amount=${unlocked.sponsored}`);
    const zero = call("W", "withdraw-zero", "withdraw-principal", [Cl.uint(0)], platform);
    findings.push(`W withdraw-zero=${resultLabel(zero.result)}`);

    const okW = call("W", "withdraw-partial", "withdraw-principal", [Cl.uint(WITHDRAW)], platform);
    findings.push(`W withdraw-partial=${resultLabel(okW.result)}`);
    const afterWithdraw = stx(platform);
    const contractAfter = stx(sponsorId);
    snapshot("post-withdraw", { platform, extra, stackspotSponsor: sponsorId });
    findings.push(
      `W stx-delta deployer=${afterWithdraw - beforeWithdraw} contract=${contractAfter - contractBefore} expectedWithdraw=${WITHDRAW}`
    );
    if (resultLabel(okW.result) === "ok") {
      expect(afterWithdraw - beforeWithdraw).toBe(BigInt(WITHDRAW));
      expect(contractBefore - contractAfter).toBe(BigInt(WITHDRAW));
    }

    const unauthAfter = call("W", "withdraw-unauth-after-partial", "withdraw-principal", [Cl.uint(1)], extra);
    expect(resultLabel(unauthAfter.result)).toBe("err u1304");

    ensureJoinWindow(platform, [p1, lp], 40);
    const extend = call("W", "extend-unauth-after-partial", "extend-sponsor-platform", [Cl.uint(STAKE_CYCLES)], extra);
    expect(resultLabel(extend.result)).toBe("err u1304");
    const extendOk = call("W", "extend-after-partial", "extend-sponsor-platform", [Cl.uint(STAKE_CYCLES)], platform);
    findings.push(`W extend-after-partial=${resultLabel(extendOk.result)}`);
    const afterExtend = recordLock("W", "after-extend");
    findings.push(`W after-extend is-locked=${afterExtend.isLocked} sponsored=${afterExtend.sponsored}`);
    const blocked = call("W", "withdraw-after-extend", "withdraw-principal", [Cl.uint(WITHDRAW)], platform);
    findings.push(`W withdraw-after-extend=${resultLabel(blocked.result)}`);
    snapshot("post-extend", { platform, extra, stackspotSponsor: sponsorId });
  });
});
