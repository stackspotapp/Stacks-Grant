/**
 * Ten concurrent jackpot copies: 5 claim after 1 cycle, 4 after 5 cycles, 1 after 10 cycles.
 * Does not modify contracts. Writes reports/jackpot-ten-pot-audit-run.json.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  activateStakingStack,
  ensureJoinWindow,
  fundAndStakeFastpoolThreshold,
  mineUntilBurnHeight,
  potRewardRelease,
  CYCLE_LENGTH,
} from "./activate-protocol";
import {
  winnerFromGetWinner,
  winnerFromPotDetails,
  winnerLine,
  principalRole,
  potRewardAmount,
  payoutLine,
  deltaSbtc,
  type SbtcSnap,
} from "./jackpot-winner";

const STX = 1_000_000;
const P1 = 100 * STX;
const P2 = 200 * STX;
const P3 = 300 * STX;
const SPONSOR = 1_000 * STX;
const FASTPOOL_LIQ = 1_000_000 * STX;
const MIN = 100 * STX;
const MAX_PARTS = 3;

const ONE_CYCLE = ["jp1c1", "jp1c2", "jp1c3", "jp1c4", "jp1c5"];
const FIVE_CYCLE = ["jp5c1", "jp5c2", "jp5c3", "jp5c4"];
const TEN_CYCLE = ["jp10c1"];

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
const winners: { scenario: string; stored: unknown; reroll: unknown; same: boolean }[] = [];
const payouts: unknown[] = [];
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
  console.log(`TP ${scenario} ${step} ${caller} ${fn} => ${row.result} burn=${row.burn}`);
  return row;
}

describe("ten-pot jackpot mix (5x1-cycle, 4x5-cycle, 1x10-cycle)", () => {
  const accounts = simnet.getAccounts();
  const platform = accounts.get("deployer")!;
  const clarinetW1 = accounts.get("wallet_1")!;
  const potDeployer = accounts.get("wallet_2")!;
  const p1 = accounts.get("wallet_3")!;
  const p2 = accounts.get("wallet_4")!;
  const p3 = accounts.get("wallet_5")!;
  const sponsor = accounts.get("wallet_6")!;
  const lp = accounts.get("wallet_7")!;
  const extra = accounts.get("wallet_8")!;

  const ids = {
    platform,
    clarinet_wallet_1: clarinetW1,
    wallet_2_pot_deployer: potDeployer,
    wallet_3: p1,
    wallet_4: p2,
    wallet_5: p3,
    wallet_6: sponsor,
    wallet_7: lp,
    wallet_8: extra,
    stackspots: `${platform}.stackspots`,
    fastpool: `${platform}.fastpool`,
    genesis_jackpot: `${platform}.jackpot`,
    stackspot_sponsor: `${platform}.stackspot-sponsor`,
  };

  const src = readFileSync(resolve("contracts/jackpot.clar"), "utf8");
  const initAdminSrc = readFileSync(resolve("contracts/init-admin.clar"), "utf8");

  function selfOf(name: string) {
    return Cl.contractPrincipal(potDeployer, name);
  }
  function potId(name: string) {
    return `${potDeployer}.${name}`;
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
      console.log(`TP ${scenario} ${step} RUNTIME ${msg}`);
      record(scenario, step, caller, contract, fn, undefined);
      return { result: undefined };
    }
  }

  function deployPot(scenario: string, name: string) {
    try {
      const deployed = simnet.deployContract(name, src, { clarityVersion: 6 }, potDeployer);
      record(scenario, "deploy", potDeployer, potId(name), "deployContract", deployed.result);
      return deployed;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      findings.push(`${scenario} exact-source deploy: ${msg}`);
      console.log(`TP ${scenario} deploy RUNTIME ${msg}`);
      record(scenario, "deploy", potDeployer, potId(name), "deployContract", undefined);
      return { result: undefined };
    }
  }

  function initPot(scenario: string, name: string, cycles: number) {
    return call(
      scenario,
      `init-${cycles}-cycle`,
      potId(name),
      "init-pot",
      [
        Cl.uint(cycles),
        Cl.uint(MIN),
        Cl.uint(MAX_PARTS),
        Cl.stringAscii(name),
        selfOf(name),
        Cl.list([]),
      ],
      potDeployer
    );
  }

  function fundPot(scenario: string, name: string) {
    const id = potId(name);
    call(scenario, "join-100", id, "join-pot", [Cl.uint(P1)], p1);
    call(scenario, "join-200", id, "join-pot", [Cl.uint(P2)], p2);
    call(scenario, "join-300", id, "join-pot", [Cl.uint(P3)], p3);
    call(scenario, "sponsor-1000", id, "join-pot-as-sponsor", [Cl.uint(SPONSOR)], sponsor);
  }

  function startPot(scenario: string, name: string) {
    ensureJoinWindow(platform, [p1, lp], 40);
    return call(scenario, "start-pot", potId(name), "start-pot", [selfOf(name)], potDeployer);
  }

  function parties() {
    return {
      [p1]: "p1/wallet_3",
      [p2]: "p2/wallet_4",
      [p3]: "p3/wallet_5",
      [sponsor]: "sponsor/wallet_6",
      [platform]: "platform/deployer",
      [potDeployer]: "potDeployer/wallet_2",
      [extra]: "extra/wallet_8",
    };
  }

  function sbtcPre(pot: string): SbtcSnap {
    return {
      [pot]: sbtc(pot).toString(),
      [platform]: sbtc(platform).toString(),
      [potDeployer]: sbtc(potDeployer).toString(),
      [p1]: sbtc(p1).toString(),
      [p2]: sbtc(p2).toString(),
      [p3]: sbtc(p3).toString(),
      [extra]: sbtc(extra).toString(),
      [`${platform}.stackspots`]: sbtc(`${platform}.stackspots`).toString(),
    };
  }

  function highlightWinner(scenario: string, contract: string, caller: string, pre: SbtcSnap) {
    const map = parties();
    const details = simnet.callReadOnlyFn(contract, "get-pot-details", [], caller);
    record(scenario, "get-pot-details-winner", caller, contract, "get-pot-details", details.result);
    const rolled = simnet.callReadOnlyFn(contract, "get-winner", [], caller);
    record(scenario, "get-winner-reroll", caller, contract, "get-winner", rolled.result);
    const stored = winnerFromPotDetails(details.result, map);
    const reroll = winnerFromGetWinner(rolled.result, map);
    const starter = principalRole(details.result, "pot-starter-address", map);
    const claimer = principalRole(details.result, "pot-claimer-address", map);
    const potPost = sbtc(contract);
    const starterPost = starter ? sbtc(starter.address) : 0n;
    const claimerPost = claimer ? sbtc(claimer.address) : 0n;
    const winnerPost = stored ? sbtc(stored.address) : 0n;
    const line = winnerLine(scenario, stored, reroll);
    const sbtcLine = payoutLine({
      scenario,
      potPre: pre[contract] ?? "na",
      potPost: potPost.toString(),
      potReward: potRewardAmount(details.result),
      starter,
      claimer,
      winner: stored,
      starterSbtc: starterPost.toString(),
      claimerSbtc: claimerPost.toString(),
      winnerSbtc: winnerPost.toString(),
      starterDelta: deltaSbtc(pre, starter?.address, starterPost),
      claimerDelta: deltaSbtc(pre, claimer?.address, claimerPost),
      winnerDelta: deltaSbtc(pre, stored?.address, winnerPost),
    });
    console.log(`TP ${line}`);
    console.log(`TP ${sbtcLine}`);
    findings.push(line);
    findings.push(sbtcLine);
    winners.push({ scenario, stored, reroll, same: !!(stored?.address && stored.address === reroll?.address) });
    payouts.push({
      scenario,
      pot: contract,
      potPre: pre[contract] ?? "na",
      potPost: potPost.toString(),
      starter,
      claimer,
      winner: stored,
      starterSbtc: starterPost.toString(),
      claimerSbtc: claimerPost.toString(),
      winnerSbtc: winnerPost.toString(),
      starterDelta: deltaSbtc(pre, starter?.address, starterPost),
      claimerDelta: deltaSbtc(pre, claimer?.address, claimerPost),
      winnerDelta: deltaSbtc(pre, stored?.address, winnerPost),
    });
  }

  function setupAndStart(scenario: string, name: string, cycles: number) {
    deployPot(scenario, name);
    const init = initPot(scenario, name, cycles);
    if (resultLabel(init.result) !== "ok") {
      findings.push(`${scenario} ${name} init ${resultLabel(init.result)}`);
      return false;
    }
    fundPot(scenario, name);
    const start = startPot(scenario, name);
    if (resultLabel(start.result) !== "ok") {
      findings.push(`${scenario} ${name} start ${resultLabel(start.result)}`);
      return false;
    }
    return true;
  }

  function claimGroup(tag: string, names: string[]) {
    const live = names;
    if (live.length === 0) {
      findings.push(`${tag} no live pots to claim`);
      return;
    }
    const releases = live.map((name) => potRewardRelease(potId(name), potDeployer));
    mineUntilBurnHeight(platform, Math.max(...releases), [p1, lp]);
    for (const name of live) {
      const pre = sbtcPre(potId(name));
      const claim = call(tag, `claim-${name}`, potId(name), "claim-pot-reward", [selfOf(name), Cl.list([])], extra);
      record(tag, `note-permissionless-claim-${name}`, extra, potId(name), "claim-observed", claim.result);
      if (resultLabel(claim.result) === "ok") highlightWinner(`${tag}-${name}`, potId(name), extra, pre);
      else findings.push(`${tag} ${name} claim ${resultLabel(claim.result)}`);
      snapshot(`${tag}-${name}-post-claim`, {
        pot: potId(name),
        platform,
        potDeployer,
        p1,
        p2,
        p3,
        sponsor,
        extra,
        stackspots: `${platform}.stackspots`,
        fastpool: `${platform}.fastpool`,
      });
    }
  }

  let bootBalances: Record<string, { stx: string; sbtc: string }> = {};

  beforeEach(() => {
    bootBalances = snapshot("pre-boot", ids);
    const initAdmin = simnet.deployContract("init-admin-late", initAdminSrc, { clarityVersion: 6 }, platform);
    record("boot", "deployer-init-admin-late", platform, `${platform}.init-admin-late`, "deployContract", initAdmin.result);
    const genesisAllowed = simnet.callReadOnlyFn(
      "stackspots",
      "is-contract-allowed-hash",
      [Cl.contractPrincipal(platform, "jackpot")],
      platform
    );
    record("boot", "platform-jackpot-hash-allowed", platform, `${platform}.stackspots`, "is-contract-allowed-hash", genesisAllowed.result);
    const allowJackpot = simnet.callPublicFn(
      "stackspots",
      "set-pot-contract-hash",
      [Cl.contractPrincipal(platform, "jackpot"), Cl.bool(true)],
      platform
    );
    record("boot", "allowlist-genesis-jackpot", platform, `${platform}.stackspots`, "set-pot-contract-hash", allowJackpot.result);
    activateStakingStack(platform, [p1, lp]);
    const liq = simnet.transferSTX(FASTPOOL_LIQ, `${platform}.fastpool`, lp);
    record("boot", "wallet_7-fastpool-liq", lp, `${platform}.fastpool`, "transferSTX", liq.result);
    fundAndStakeFastpoolThreshold(platform, lp);
    ensureJoinWindow(platform, [p1, lp], 40);
    snapshot("post-boot", { ...ids, fastpool: `${platform}.fastpool` });
  });

  afterAll(() => {
    mkdirSync(resolve("reports"), { recursive: true });
    writeFileSync(
      resolve("reports/jackpot-ten-pot-audit-run.json"),
      JSON.stringify(
        {
          identities: ids,
          cycleLength: CYCLE_LENGTH,
          mix: { oneCycle: ONE_CYCLE, fiveCycle: FIVE_CYCLE, tenCycle: TEN_CYCLE },
          log,
          findings,
          winners,
          payouts,
          snaps,
          bootBalances,
        },
        null,
        2
      )
    );
  });

  it("boot: wallet_7 liquidity is not pot principal", () => {
    expect(stx(`${platform}.jackpot`)).toBe(0n);
    expect(stx(lp) < 100_000_000_000_000n).toBe(true);
  });

  it("10 pots: 5 claim at 1 cycle, 4 at 5 cycles, 1 at 10 cycles", () => {
    const one = ONE_CYCLE.filter((name) => setupAndStart("1C", name, 1));
    const five = FIVE_CYCLE.filter((name) => setupAndStart("5C", name, 5));
    const ten = TEN_CYCLE.filter((name) => setupAndStart("10C", name, 10));
    claimGroup("1C", one);
    claimGroup("5C", five);
    claimGroup("10C", ten);
    findings.push(`ten-pot winners=${winners.length} pots=${one.length + five.length + ten.length}`);
  });
});
