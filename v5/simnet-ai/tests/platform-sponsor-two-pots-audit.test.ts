/**
 * Two platform sponsors (deployer calls sponsor-platform with rules 1–2),
 * then three jackpot copies: one sponsor, two sponsors, none. Five joiners each,
 * then start, mine to reward-release, and claim.
 * Writes reports/platform-sponsor-two-pots-audit-run.json.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  activateStakingStack,
  CYCLE_LENGTH,
  currentPoxCycle,
  ensureJoinWindow,
  fundAndStakeFastpoolThreshold,
  potRewardRelease,
} from "./activate-protocol";

const STX = 1_000_000;
const JOIN = 100 * STX;
const FASTPOOL_LIQ = 1_000_000 * STX;
const SPONSOR_AMOUNT = 5_000 * STX;
const SPONSOR_CYCLES = 10;
const JOINERS = 5;
const POT_CYCLES = 1;

const RULE_LIST = Cl.list([
  Cl.tuple({
    label: Cl.stringAscii("rule-1"),
    state: Cl.bool(true),
    required: Cl.uint(10),
    score: Cl.uint(300),
  }),
  Cl.tuple({
    label: Cl.stringAscii("rule-2"),
    state: Cl.bool(true),
    required: Cl.uint(2),
    score: Cl.uint(500),
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
const snaps: { label: string; burn: number; rows: Record<string, { stx: string; sbtc: string }> }[] = [];
const poolReads: Record<string, unknown>[] = [];

function cvJson(cv: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(cv, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  } catch {
    return String(cv);
  }
}

function uintish(cv: unknown): string {
  const walk = (value: unknown): string | undefined => {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number") return String(value);
    if (typeof value === "string" && /^\d+$/.test(value)) return value;
    if (value && typeof value === "object" && "value" in value) return walk((value as { value: unknown }).value);
    return undefined;
  };
  return walk(cv) ?? JSON.stringify(cvJson(cv));
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

function resultLabel(r: { type?: string | number; value?: { value?: unknown } } | undefined): string {
  if (!r) return "none";
  if (r.type === ClarityType.ResponseOk) return "ok";
  if (r.type === ClarityType.BoolTrue || r.type === "true") return "ok";
  if (r.type === ClarityType.ResponseErr) {
    const code = r.value?.value;
    return code === undefined ? "err" : `err u${code}`;
  }
  return JSON.stringify(r);
}

describe("platform sponsor two copies + three pots", () => {
  const accounts = simnet.getAccounts();
  const deployer = accounts.get("deployer")!;
  const potDeployer = accounts.get("wallet_2")!;
  const lp = accounts.get("wallet_7")!;
  const joiners = [
    { name: "wallet_1", address: accounts.get("wallet_1")! },
    { name: "wallet_3", address: accounts.get("wallet_3")! },
    { name: "wallet_4", address: accounts.get("wallet_4")! },
    { name: "wallet_5", address: accounts.get("wallet_5")! },
    { name: "wallet_6", address: accounts.get("wallet_6")! },
  ];

  const jackpotSrc = readFileSync(resolve("contracts/jackpot.clar"), "utf8");
  const sponsorSrc = readFileSync(resolve("contracts/stackspot-sponsor.clar"), "utf8");
  const initAdminSrc = readFileSync(resolve("contracts/init-admin.clar"), "utf8");

  const sponsor1 = `${deployer}.sponsor-1`;
  const sponsor2 = `${deployer}.sponsor-2`;

  function record(
    scenario: string,
    step: string,
    caller: string,
    contract: string,
    fn: string,
    result: { type?: string | number; value?: { value?: unknown } } | undefined
  ) {
    const row = {
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
    console.log(`PS ${scenario} ${step} ${fn} => ${row.result} burn=${row.burn}`);
    return row;
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
      record(scenario, step, caller, contract, fn, undefined);
      return { result: undefined };
    }
  }

  function sponsorPlatform(name: string) {
    return call(
      "sponsors",
      `sponsor-platform-${name}`,
      `${deployer}.${name}`,
      "sponsor-platform",
      [
        Cl.uint(SPONSOR_AMOUNT),
        Cl.uint(SPONSOR_CYCLES),
        Cl.stringAscii("https://stackspots.example/logo.png"),
        Cl.stringAscii("simnet two-sponsor audit"),
        RULE_LIST,
      ],
      deployer
    );
  }

  function deployJackpot(name: string) {
    try {
      const deployed = simnet.deployContract(name, jackpotSrc, { clarityVersion: 6 }, potDeployer);
      record(name, "deploy", potDeployer, `${potDeployer}.${name}`, "deployContract", deployed.result);
      return deployed;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      findings.push(`${name} deploy runtime: ${msg}`);
      record(name, "deploy", potDeployer, `${potDeployer}.${name}`, "deployContract", undefined);
      return { result: undefined };
    }
  }

  function initJackpot(name: string, sponsors: ReturnType<typeof Cl.contractPrincipal>[]) {
    return call(
      name,
      `init-${sponsors.length}-sponsors`,
      `${potDeployer}.${name}`,
      "init-pot",
      [
        Cl.uint(POT_CYCLES),
        Cl.uint(JOIN),
        Cl.uint(JOINERS),
        Cl.stringAscii(name),
        Cl.contractPrincipal(potDeployer, name),
        Cl.list(sponsors),
      ],
      potDeployer
    );
  }

  function joinFive(name: string) {
    const id = `${potDeployer}.${name}`;
    for (const joiner of joiners) {
      const joined = call(name, `join-${joiner.name}`, id, "join-pot", [Cl.uint(JOIN)], joiner.address);
      if (resultLabel(joined.result) !== "ok") {
        findings.push(`${name} ${joiner.name} join ${resultLabel(joined.result)}`);
      }
    }
  }

  function snapshot(label: string, addrs: Record<string, string>) {
    const rows: Record<string, { stx: string; sbtc: string }> = {};
    for (const [n, addr] of Object.entries(addrs)) {
      rows[n] = { stx: stx(addr).toString(), sbtc: sbtc(addr).toString() };
    }
    snaps.push({ label, burn: simnet.burnBlockHeight, rows });
    console.log(`SNAP ${label} burn=${simnet.burnBlockHeight} ${JSON.stringify(rows)}`);
    return rows;
  }

  function tracked(pots: string[]) {
    const addrs: Record<string, string> = {
      "sponsor-1": sponsor1,
      "sponsor-2": sponsor2,
      stackspotSponsor: `${deployer}.stackspot-sponsor`,
      stackspots: `${deployer}.stackspots`,
      simPox5: `${deployer}.sim-pox-5`,
      fastpool: `${deployer}.fastpool`,
      potDeployer,
      deployer,
    };
    for (const name of pots) addrs[name] = `${potDeployer}.${name}`;
    for (const j of joiners) addrs[j.name] = j.address;
    return addrs;
  }

  beforeEach(() => {
    simnet.deployContract("init-admin-late", initAdminSrc, { clarityVersion: 6 }, deployer);
    try {
      activateStakingStack(deployer, []);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      findings.push(`boot activateStakingStack: ${msg}`);
    }
    simnet.transferSTX(FASTPOOL_LIQ, `${deployer}.fastpool`, lp);
    try {
      fundAndStakeFastpoolThreshold(deployer, lp);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      findings.push(`boot fundAndStakeFastpoolThreshold: ${msg}`);
    }
    ensureJoinWindow(deployer, [joiners[0].address, lp], 40);
  });

  afterAll(() => {
    mkdirSync(resolve("reports"), { recursive: true });
    writeFileSync(
      resolve("reports/platform-sponsor-two-pots-audit-run.json"),
      JSON.stringify(
        {
          identities: {
            deployer,
            potDeployer,
            sponsor1,
            sponsor2,
            joiners: joiners.map((j) => ({ name: j.name, address: j.address })),
          },
          rules: [
            { rule: 1, required: 10, score: 300 },
            { rule: 2, required: 2, score: 500 },
          ],
          log,
          snaps,
          poolReads,
          findings,
        },
        null,
        2
      )
    );
  });

  it("two sponsors via sponsor-platform, three pots join/start/claim", () => {
    for (const name of ["sponsor-1", "sponsor-2"] as const) {
      const deployed = simnet.deployContract(name, sponsorSrc, { clarityVersion: 6 }, deployer);
      record("sponsors", `deploy-${name}`, deployer, `${deployer}.${name}`, "deployContract", deployed.result);
      expect(resultLabel(deployed.result)).toBe("ok");
      const allow = call(
        "sponsors",
        `allowlist-${name}`,
        `${deployer}.stackspots`,
        "update-platform-sponsor-contract",
        [Cl.contractPrincipal(deployer, name), Cl.bool(true)],
        deployer
      );
      expect(resultLabel(allow.result)).toBe("ok");
      const funded = sponsorPlatform(name);
      expect(resultLabel(funded.result)).toBe("ok");
    }

    const s1 = Cl.contractPrincipal(deployer, "sponsor-1");
    const s2 = Cl.contractPrincipal(deployer, "sponsor-2");
    const pots = ["pot-one", "pot-two", "pot-three"] as const;
    const sponsorsByPot: Record<(typeof pots)[number], ReturnType<typeof Cl.contractPrincipal>[]> = {
      "pot-one": [s1],
      "pot-two": [s1, s2],
      "pot-three": [],
    };

    deployJackpot("pot-one");
    expect(resultLabel(initJackpot("pot-one", sponsorsByPot["pot-one"]).result)).toBe("ok");
    joinFive("pot-one");

    deployJackpot("pot-two");
    expect(resultLabel(initJackpot("pot-two", sponsorsByPot["pot-two"]).result)).toBe("ok");
    joinFive("pot-two");

    deployJackpot("pot-three");
    expect(resultLabel(initJackpot("pot-three", sponsorsByPot["pot-three"]).result)).toBe("ok");
    joinFive("pot-three");

    const stakers = [joiners[0].address, lp];
    ensureJoinWindow(deployer, stakers, 40);
    for (const name of pots) {
      const started = call(
        name,
        "start-pot",
        `${potDeployer}.${name}`,
        "start-pot",
        [Cl.contractPrincipal(potDeployer, name)],
        potDeployer
      );
      if (resultLabel(started.result) !== "ok") {
        findings.push(`${name} start-pot ${resultLabel(started.result)}`);
      }
    }

    snapshot("post-start", tracked([...pots]));

    const releases = pots.map((name) => potRewardRelease(`${potDeployer}.${name}`, potDeployer));
    const lockCycle = currentPoxCycle(deployer);
    const firstRewardCycle = lockCycle + 1;
    const yieldClaimCycle = firstRewardCycle + 2;
    const yieldAt = yieldClaimCycle * CYCLE_LENGTH;
    const claimAt = Math.max(...releases, yieldAt);
    while (simnet.burnBlockHeight <= claimAt || currentPoxCycle(deployer) < yieldClaimCycle) {
      const remaining = Math.max(1, claimAt - simnet.burnBlockHeight + 1);
      simnet.mineEmptyBurnBlocks(remaining);
    }
    record("clock", "mine-to-yield-claim-cycle", deployer, "simnet", "mineEmptyBurnBlocks", {
      type: ClarityType.ResponseOk,
      value: { value: `${simnet.burnBlockHeight}:lock=${lockCycle}:first=${firstRewardCycle}:claim-cycle=${yieldClaimCycle}` },
    });

    const poxSbtc = simnet.callReadOnlyFn(
      "sbtc-token",
      "get-balance",
      [Cl.principal(`${deployer}.sim-pox-5`)],
      deployer
    );
    poolReads.push({
      burn: simnet.burnBlockHeight,
      fn: "sbtc-token.get-balance",
      account: `${deployer}.sim-pox-5`,
      value: uintish(poxSbtc.result),
      raw: cvJson(poxSbtc.result),
    });
    console.log(`POOL sim-pox-5 sbtc balance => ${uintish(poxSbtc.result)}`);

    const cycleNow = currentPoxCycle(deployer);
    const stakerIds = [
      ...pots.map((name) => ({ label: name, principal: `${potDeployer}.${name}` })),
      { label: "sponsor-1", principal: sponsor1 },
      { label: "sponsor-2", principal: sponsor2 },
    ];
    for (let c = 1; c <= cycleNow; c++) {
      const signerUnclaimed = simnet.callReadOnlyFn(
        "sim-pox-5",
        "get-signer-unclaimed-rewards-for-cycle",
        [Cl.principal(`${deployer}.fastpool`), Cl.uint(c), Cl.none()],
        deployer
      );
      const signerRow = {
        cycle: c,
        burn: simnet.burnBlockHeight,
        fn: "get-signer-unclaimed-rewards-for-cycle",
        signer: `${deployer}.fastpool`,
        value: uintish(signerUnclaimed.result),
        raw: cvJson(signerUnclaimed.result),
      };
      poolReads.push(signerRow);
      console.log(`POOL signer-unclaimed c${c} => ${signerRow.value}`);
      record("pool", `signer-unclaimed-c${c}`, deployer, `${deployer}.sim-pox-5`, "get-signer-unclaimed-rewards-for-cycle", {
        type: ClarityType.ResponseOk,
        value: { value: signerRow.value },
      });

      for (const staker of stakerIds) {
        const earned = simnet.callReadOnlyFn(
          "fastpool",
          "get-earned-staker-rewards",
          [Cl.principal(staker.principal), Cl.uint(c), Cl.none()],
          deployer
        );
        const earnedRow = {
          cycle: c,
          burn: simnet.burnBlockHeight,
          fn: "get-earned-staker-rewards",
          staker: staker.principal,
          label: staker.label,
          value: cvJson(earned.result),
        };
        poolReads.push(earnedRow);
        console.log(`POOL earned ${staker.label} c${c} => ${JSON.stringify(earnedRow.value)}`);
        record("pool", `earned-${staker.label}-c${c}`, deployer, `${deployer}.fastpool`, "get-earned-staker-rewards", earned.result);
      }
    }

    const addrs = tracked([...pots]);
    snapshot("pre-claim", addrs);
    for (const name of pots) {
      const claimed = call(
        name,
        "claim-pot-reward",
        `${potDeployer}.${name}`,
        "claim-pot-reward",
        [Cl.contractPrincipal(potDeployer, name), Cl.list(sponsorsByPot[name])],
        potDeployer
      );
      const label = resultLabel(claimed.result);
      if (label !== "ok") findings.push(`${name} claim-pot-reward ${label}`);
    }
    snapshot("post-claim", addrs);

    expect(joiners).toHaveLength(JOINERS);
  });
});
