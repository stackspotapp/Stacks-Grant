/**
 * Isolated one-cycle crowdfund lifecycle audit (Scenarios 1–6 + extra cases).
 * Does not modify contracts. Writes reports/one-cycle-audit-run.json.
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

const STX = 1_000_000;
const P1 = 100 * STX;
const P2 = 200 * STX;
const P3 = 300 * STX;
const SPONSOR = 1_000 * STX;
const FASTPOOL_LIQ = 1_000_000 * STX;
const MIN = 100 * STX;
const MAX_PARTS = 3;
const CYCLES = 1;

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
  console.log(`OC ${scenario} ${step} ${caller} ${fn} => ${row.result} burn=${row.burn}`);
  return row;
}

/** Byte-identical to genesis `.crowd-fund` so `init-admin` hash allowlist can match copies. */

describe("one-cycle crowdfund lifecycle audit", () => {
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
    genesis_crowd_fund: `${platform}.crowd-fund`,
    stackspot_sponsor: `${platform}.stackspot-sponsor`,
  };

  const src = readFileSync(resolve("contracts/crowd-fund.clar"), "utf8");
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
      console.log(`OC ${scenario} ${step} RUNTIME ${msg}`);
      record(scenario, step, caller, contract, fn, undefined);
      return { result: undefined };
    }
  }

  function deployPot(scenario: string, name: string) {
    try {
      const deployed = simnet.deployContract(name, src, { clarityVersion: 6 }, potDeployer);
      record(scenario, "deploy", potDeployer, potId(name), "deployContract", deployed.result);
      const genesisHash = simnet.callReadOnlyFn(
        "stackspots",
        "is-contract-allowed-hash",
        [Cl.contractPrincipal(platform, "crowd-fund")],
        platform
      );
      record(scenario, "genesis-crowd-fund-hash-allowed", platform, `${platform}.stackspots`, "is-contract-allowed-hash", genesisHash.result);
      const copyHash = simnet.callReadOnlyFn(
        "stackspots",
        "is-contract-allowed-hash",
        [selfOf(name)],
        platform
      );
      record(scenario, "wallet2-copy-hash-allowed", platform, `${platform}.stackspots`, "is-contract-allowed-hash", copyHash.result);
      return deployed;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      findings.push(`${scenario} exact-source deploy: ${msg}`);
      console.log(`OC ${scenario} deploy RUNTIME ${msg}`);
      record(scenario, "deploy", potDeployer, potId(name), "deployContract", undefined);
      return { result: undefined };
    }
  }

  function initPot(scenario: string, name: string, withPlatformSponsor: boolean) {
    const sponsors = withPlatformSponsor
      ? Cl.list([Cl.contractPrincipal(platform, "stackspot-sponsor")])
      : Cl.list([]);
    return call(
      scenario,
      withPlatformSponsor ? "init-with-platform-sponsor" : "init-no-platform-sponsor",
      potId(name),
      "init-pot",
      [
        Cl.uint(CYCLES),
        Cl.uint(MIN),
        Cl.uint(MAX_PARTS),
        Cl.stringAscii(name),
        Cl.principal(potDeployer),
        selfOf(name),
        sponsors,
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

  function mineToRelease(name: string) {
    const release = potRewardRelease(potId(name), potDeployer);
    mineUntilBurnHeight(platform, release, [p1, lp]);
    return release;
  }

  let bootBalances: Record<string, { stx: string; sbtc: string }> = {};

  beforeEach(() => {
    console.log(
      `IDENTITY platform(deployer)=${platform} clarinet_wallet_1=${clarinetW1} pot_deployer(wallet_2)=${potDeployer} clarity=${(simnet as { getDefaultClarityVersionForCurrentEpoch?: () => string }).getDefaultClarityVersionForCurrentEpoch?.() ?? "unknown"}`
    );
    bootBalances = snapshot("pre-boot", ids);
    const initAdmin = simnet.deployContract("init-admin-late", initAdminSrc, { clarityVersion: 6 }, platform);
    record("boot", "deployer-init-admin-late", platform, `${platform}.init-admin-late`, "deployContract", initAdmin.result);
    const genesisAllowed = simnet.callReadOnlyFn(
      "stackspots",
      "is-contract-allowed-hash",
      [Cl.contractPrincipal(platform, "crowd-fund")],
      platform
    );
    record(
      "boot",
      "platform-crowd-fund-hash-allowed",
      platform,
      `${platform}.stackspots`,
      "is-contract-allowed-hash",
      genesisAllowed.result
    );
    const sponsorAllowed = simnet.callReadOnlyFn(
      "stackspots",
      "validate-platform-sponsor-contract",
      [Cl.contractPrincipal(platform, "stackspot-sponsor")],
      platform
    );
    record(
      "boot",
      "platform-sponsor-hash-allowed",
      platform,
      `${platform}.stackspots`,
      "validate-platform-sponsor-contract",
      sponsorAllowed.result
    );
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
      resolve("reports/one-cycle-audit-run.json"),
      JSON.stringify(
        {
          identities: ids,
          cycleLength: CYCLE_LENGTH,
          log,
          findings,
          snaps,
          bootBalances,
        },
        null,
        2
      )
    );
  });

  it("boot: wallet_7 liquidity is not pot principal", () => {
    expect(stx(`${platform}.crowd-fund`)).toBe(0n);
    expect(stx(lp) < 100_000_000_000_000n).toBe(true);
  });

  it("Scenario 1 — no platform sponsor, claim at cycle end", () => {
    const name = "cf-s1";
    deployPot("S1", name);
    const init = initPot("S1", name, false);
    if (resultLabel(init.result) !== "ok") {
      findings.push(`S1 init ${resultLabel(init.result)} (no extra set-pot-contract-hash)`);
      return;
    }
    fundPot("S1", name);
    expect(stx(potId(name))).toBe(BigInt(P1 + P2 + P3 + SPONSOR));
    const start = startPot("S1", name);
    expect(resultLabel(start.result)).toBe("ok");
    const beforeClaim = snapParty("S1-pre-claim", name);
    mineToRelease(name);
    const unauthorized = call("S1", "claim-empty-closer", potId(name), "claim-pot-reward", [selfOf(name), Cl.list([])], extra);
    record("S1", "note-permissionless-claim", extra, potId(name), "claim-observed", unauthorized.result);
    const claim = call("S1", "claim", potId(name), "claim-pot-reward", [selfOf(name), Cl.list([])], potDeployer);
    snapParty("S1-post-claim", name);
    if (resultLabel(claim.result) !== "ok") findings.push(`S1 claim ${resultLabel(claim.result)}`);
    try {
      const twice = call("S1", "claim-twice", potId(name), "claim-pot-reward", [selfOf(name), Cl.list([])], potDeployer);
      record("S1", "second-claim", potDeployer, potId(name), "claim-pot-reward", twice.result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      findings.push(`S1 second-claim runtime: ${msg}`);
      console.log(`OC S1 claim-twice RUNTIME ${msg}`);
    }
    void beforeClaim;
  });

  it("Scenario 2 — no platform sponsor, cancel at cycle end", () => {
    const name = "cf-s2";
    deployPot("S2", name);
    if (resultLabel(initPot("S2", name, false).result) !== "ok") {
      findings.push("S2 init failed without extra hash calls");
      return;
    }
    fundPot("S2", name);
    expect(resultLabel(startPot("S2", name).result)).toBe("ok");
    mineToRelease(name);
    const cancel = call("S2", "cancel-at-end", potId(name), "cancel-pot", [selfOf(name)], potDeployer);
    snapParty("S2-post-cancel", name);
    const again = call("S2", "cancel-twice", potId(name), "cancel-pot", [selfOf(name)], potDeployer);
    const claimAfter = call("S2", "claim-after-cancel", potId(name), "claim-pot-reward", [selfOf(name), Cl.list([])], potDeployer);
    if (resultLabel(cancel.result) !== "ok") findings.push(`S2 cancel ${resultLabel(cancel.result)}`);
    void again;
    void claimAfter;
  });

  it("Scenario 3 — no platform sponsor, cancel before cycle end", () => {
    const name = "cf-s3";
    deployPot("S3", name);
    if (resultLabel(initPot("S3", name, false).result) !== "ok") {
      findings.push("S3 init failed without extra hash calls");
      return;
    }
    fundPot("S3", name);
    expect(resultLabel(startPot("S3", name).result)).toBe("ok");
    const early = call("S3", "cancel-immediately", potId(name), "cancel-pot", [selfOf(name)], potDeployer);
    const unauth = call("S3", "cancel-unauth-immediate", potId(name), "cancel-pot", [selfOf(name)], extra);
    mineUntilBurnHeight(platform, simnet.burnBlockHeight + Math.floor(CYCLE_LENGTH / 2), [p1, lp]);
    const mid = call("S3", "cancel-mid-cycle", potId(name), "cancel-pot", [selfOf(name)], potDeployer);
    snapParty("S3-after-early-cancels", name);
    findings.push(`S3 immediate=${resultLabel(early.result)} unauth=${resultLabel(unauth.result)} mid=${resultLabel(mid.result)}`);
  });

  it("Scenario 4 — with platform sponsor, cancel at cycle end", () => {
    const name = "cf-s4";
    deployPot("S4", name);
    const init = initPot("S4", name, true);
    record("S4", "init-result", potDeployer, potId(name), "init-pot", init.result);
    if (resultLabel(init.result) !== "ok") {
      findings.push(`S4 platform-sponsor init ${resultLabel(init.result)}`);
      const fallback = initPot("S4", name, false);
      record("S4", "fallback-init-no-ps", potDeployer, potId(name), "init-pot", fallback.result);
      if (resultLabel(fallback.result) !== "ok") return;
    }
    fundPot("S4", name);
    const start = startPot("S4", name);
    if (resultLabel(start.result) !== "ok") {
      findings.push(`S4 start ${resultLabel(start.result)}`);
      return;
    }
    mineToRelease(name);
    const cancel = call(
      "S4",
      "cancel-at-end-with-ps-arg",
      potId(name),
      "cancel-pot",
      [selfOf(name)],
      potDeployer
    );
    snapParty("S4-post-cancel", name);
    if (resultLabel(cancel.result) !== "ok") findings.push(`S4 cancel ${resultLabel(cancel.result)}`);
  });

  it("Scenario 5 — with platform sponsor, cancel before cycle end", () => {
    const name = "cf-s5";
    deployPot("S5", name);
    const init = initPot("S5", name, true);
    if (resultLabel(init.result) !== "ok") {
      findings.push(`S5 platform-sponsor init ${resultLabel(init.result)}`);
      const fallback = initPot("S5", name, false);
      if (resultLabel(fallback.result) !== "ok") return;
    }
    fundPot("S5", name);
    const start = startPot("S5", name);
    if (resultLabel(start.result) !== "ok") return;
    const early = call("S5", "cancel-immediately", potId(name), "cancel-pot", [selfOf(name)], potDeployer);
    findings.push(`S5 early-cancel ${resultLabel(early.result)}`);
  });

  it("Scenario 6 — with platform sponsor, claim at cycle end", () => {
    const name = "cf-s6";
    deployPot("S6", name);
    const init = initPot("S6", name, true);
    if (resultLabel(init.result) !== "ok") {
      findings.push(`S6 platform-sponsor init ${resultLabel(init.result)}`);
      const fallback = initPot("S6", name, false);
      if (resultLabel(fallback.result) !== "ok") return;
    }
    fundPot("S6", name);
    const start = startPot("S6", name);
    if (resultLabel(start.result) !== "ok") return;
    mineToRelease(name);
    const withPs = call(
      "S6",
      "claim-with-platform-sponsor-list",
      potId(name),
      "claim-pot-reward",
      [selfOf(name), Cl.list([Cl.contractPrincipal(platform, "stackspot-sponsor")])],
      potDeployer
    );
    const empty = call("S6", "claim-empty-sponsors", potId(name), "claim-pot-reward", [selfOf(name), Cl.list([])], potDeployer);
    snapParty("S6-post-claim", name);
    findings.push(`S6 claim-with-ps=${resultLabel(withPs.result)} claim-empty=${resultLabel(empty.result)}`);
  });

  describe("additional cases", () => {
    it("A init duplicate / unauthorized / zero-ish config", () => {
      const name = "cf-extra-a";
      deployPot("A", name);
      call("A", "init-unauth", potId(name), "init-pot", [Cl.uint(CYCLES), Cl.uint(MIN), Cl.uint(MAX_PARTS), Cl.stringAscii(name), Cl.principal(potDeployer), selfOf(name), Cl.list([])], extra);
      const ok = initPot("A", name, false);
      if (resultLabel(ok.result) !== "ok") {
        findings.push(`A init ${resultLabel(ok.result)}`);
        return;
      }
      const dup = initPot("A", name, false);
      expect(resultLabel(dup.result)).toBe("err u1409");
    });

    it("B funding edges", () => {
      const name = "cf-extra-b";
      deployPot("B", name);
      initPot("B", name, false);
      call("B", "join-zero", potId(name), "join-pot", [Cl.uint(0)], p1);
      call("B", "join-below-min", potId(name), "join-pot", [Cl.uint(MIN - 1)], p1);
      call("B", "join-ok", potId(name), "join-pot", [Cl.uint(P1)], p1);
      call("B", "join-dup", potId(name), "join-pot", [Cl.uint(P1)], p1);
      call("B", "sponsor-zero", potId(name), "join-pot-as-sponsor", [Cl.uint(0)], sponsor);
      call("B", "sponsor-ok", potId(name), "join-pot-as-sponsor", [Cl.uint(SPONSOR)], sponsor);
      call("B", "sponsor-dup", potId(name), "join-pot-as-sponsor", [Cl.uint(SPONSOR)], sponsor);
    });

    it("C start without init / claim before eligibility", () => {
      const name = "cf-extra-c";
      deployPot("C", name);
      call("C", "start-uninitialized", potId(name), "start-pot", [selfOf(name)], potDeployer);
      initPot("C", name, false);
      fundPot("C", name);
      startPot("C", name);
      call("C", "claim-before-release", potId(name), "claim-pot-reward", [selfOf(name), Cl.list([])], potDeployer);
    });

    it("D cancel before start", () => {
      const name = "cf-extra-d";
      deployPot("D", name);
      initPot("D", name, false);
      fundPot("D", name);
      call("D", "cancel-before-start", potId(name), "cancel-pot", [selfOf(name)], potDeployer);
    });

    it("E pot-sponsor principal returned on claim", () => {
      const name = "cf-extra-e";
      deployPot("E", name);
      if (resultLabel(initPot("E", name, false).result) !== "ok") {
        findings.push("E init failed");
        return;
      }
      fundPot("E", name);
      const sponsorBefore = stx(sponsor);
      expect(resultLabel(startPot("E", name).result)).toBe("ok");
      mineToRelease(name);
      const claim = call("E", "claim-return-sponsor", potId(name), "claim-pot-reward", [selfOf(name), Cl.list([])], potDeployer);
      const sponsorAfter = stx(sponsor);
      snapParty("E-post-claim", name);
      findings.push(
        `E claim=${resultLabel(claim.result)} sponsor-delta=${sponsorAfter - sponsorBefore} expected=${SPONSOR}`
      );
      if (resultLabel(claim.result) === "ok") {
        expect(sponsorAfter - sponsorBefore).toBe(BigInt(SPONSOR));
      }
    });
  });

  function snapParty(label: string, name: string) {
    return snapshot(label, {
      pot: potId(name),
      platform,
      potDeployer,
      p1,
      p2,
      p3,
      sponsor,
      lp,
      extra,
      stackspotSponsor: `${platform}.stackspot-sponsor`,
      stackspots: `${platform}.stackspots`,
      fastpool: `${platform}.fastpool`,
    });
  }
});
