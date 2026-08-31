/**
 * StacksPot Acceleration Proposal — simnet campaign
 *
 * Parameters from:
 * https://docs.google.com/document/d/1PAUPE02d_dxAkXditCHKnaqH1CHzgE4BZoqct9IAWuE
 *
 * PoX cycle = 2100 burn blocks (mainnet length).
 * Each program cohort: deploy / init / join / start in PoX cycle N,
 * claim in PoX cycle N+2 (claim window for cycle N+1 rewards).
 * 10 program cycles × 23 pots, reusable 500,000 STX sponsorship.
 */
import { describe, expect, it } from "vitest";
import { Cl, ClarityType, privateKeyToAddress } from "@stacks/transactions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeAccelerationWorkbook, type TxRow } from "./acceleration-tx-report";
import {
  activateStakingStack,
  claimReleaseHeight,
  currentPoxCycle,
  CYCLE_LENGTH,
  ensureJoinWindow,
  mineUntilBurnHeight,
  payoutPotFromFastpool,
  potPoolConfig,
  potRewardRelease,
  THRESHOLD_STAKE_USTX,
} from "./activate-protocol";

const STX = 1_000_000;
const PROGRAM_CYCLES = 10;
const POTS_PER_CYCLE = 23;
const TOTAL_POTS = PROGRAM_CYCLES * POTS_PER_CYCLE;
const SPONSOR_ALLOCATION_STX = 500_000;
const JACKPOT_STAKE_CYCLES = 1;
const BURN_BLOCKS_PER_POX_CYCLE = CYCLE_LENGTH;
const PREPARE_CYCLE_LENGTH = 50;
const MORE_THAN_ONE_CYCLE = PREPARE_CYCLE_LENGTH + BURN_BLOCKS_PER_POX_CYCLE;


const TIER_A = {
  id: "A",
  type: "jackpot" as const,
  potsPerCycle: 10,
  entryMinStx: 25,
  minParticipants: 25,
  potTargetStx: 625,
  boostPerPotStx: 10_000,
  tierCapitalStx: 100_000,
};
const TIER_B = {
  id: "B",
  type: "jackpot" as const,
  potsPerCycle: 12,
  entryMinStx: 50,
  minParticipants: 50,
  potTargetStx: 2_500,
  boostPerPotStx: 25_000,
  tierCapitalStx: 300_000,
};
const TIER_C = {
  id: "C",
  type: "sequential" as const,
  potsPerCycle: 1,
  entryMinStx: 350,
  minParticipants: 10,
  potTargetStx: 3_500,
  boostPerPotStx: 100_000,
  tierCapitalStx: 100_000,
};
const TIERS = [TIER_A, TIER_B, TIER_C] as const;

const LIFECYCLE_TXS_PER_POT = 4;
const TIER_STATS = {
  A: { stackedStx: 1_062_500, lifecycleTxs: 400, joinTxs: 2_500, totalTxs: 2_900, participants: 2_500 },
  B: { stackedStx: 3_300_000, lifecycleTxs: 480, joinTxs: 6_000, totalTxs: 6_480, participants: 6_000 },
  C: { stackedStx: 1_035_000, lifecycleTxs: 40, joinTxs: 100, totalTxs: 140, participants: 100 },
} as const;

const PROGRAM = {
  totalStackedStx: 5_397_500,
  lifecycleTxs: 920,
  joinTxs: 8_600,
  totalTxs: 9_520,
  participants: 8_600,
  potsPerMonth: 46,
  monthlyParticipants: 1_720,
};

function ustx(stx: number): number {
  return stx * STX;
}

function testnetAddress(index: number): string {
  return privateKeyToAddress((index + 1).toString(16).padStart(64, "0"), "testnet");
}

function isOk(result: { type: string | number }): boolean {
  return result.type === ClarityType.ResponseOk;
}

function isNotErr(result: { type: string | number }): boolean {
  return result.type !== ClarityType.ResponseErr;
}

function failMsg(label: string, result: { type: number; value?: unknown }): string {
  return `${label} failed: ${JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`;
}

function clarityErr(result: { type: string | number; value?: { value?: unknown } }): string {
  const code = result.value?.value;
  return code === undefined ? "err" : `err u${code}`;
}

function stxBalance(address: string): bigint {
  return simnet.getAssetsMap().get("STX")?.get(address) ?? 0n;
}

function unwrapOkUint(result: { type: string | number; value?: unknown }): bigint {
  if (!isOk(result)) return 0n;
  const inner = (result as { value?: unknown }).value;
  if (typeof inner === "bigint") return inner;
  if (typeof inner === "number") return BigInt(inner);
  if (inner && typeof inner === "object" && "value" in inner) {
    const v = (inner as { value: unknown }).value;
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(v);
    if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  }
  return 0n;
}

function formatStx(ustxAmount: bigint): string {
  const whole = ustxAmount / BigInt(STX);
  const frac = (ustxAmount % BigInt(STX)).toString().padStart(6, "0");
  return `${whole}.${frac}`;
}

function formatBtc(sats: bigint): string {
  const whole = sats / 100_000_000n;
  const frac = (sats % 100_000_000n).toString().padStart(8, "0");
  return `${whole}.${frac}`;
}

type PotRef = {
  cycle: number;
  tier: (typeof TIERS)[number];
  index: number;
  name: string;
  address: string;
  id: string;
};

const jackpotSrc = readFileSync(resolve("contracts/jackpot.clar"), "utf8");
const sequentialSrc = readFileSync(resolve("contracts/sequential.clar"), "utf8");

/** Rewrite `.name` deps so a non-deployer publisher still calls the core protocol. */
function qualifyProtocolRefs(source: string, protocolDeployer: string): string {
  const replacements: Array<[string, string]> = [
    [".stackspots-trait.stackspots-trait", `'${protocolDeployer}.stackspots-trait.stackspots-trait`],
    [".stackspots-vrf", `'${protocolDeployer}.stackspots-vrf`],
    [".stackspots", `'${protocolDeployer}.stackspots`],
    [".sim-pox-5", `'${protocolDeployer}.sim-pox-5`],
    [".fastpool", `'${protocolDeployer}.fastpool`],
    [".sbtc-token", `'${protocolDeployer}.sbtc-token`],
  ];
  let next = source;
  for (const [i, [from]] of replacements.entries()) {
    next = next.replaceAll(from, `__DEP_${i}__`);
  }
  for (const [i, [, to]] of replacements.entries()) {
    next = next.replaceAll(`__DEP_${i}__`, to);
  }
  return next;
}

/**
 * Template pots call `log-pre-init` at deploy, which requires a registered NFT.
 * Copies are not registered yet, so drop that top-level call from the published source.
 */
function stripDeployTimeLogPreInit(source: string): string {
  return source.replace(/\n\(contract-call\? [^\n]+ log-pre-init PRE_INIT_LOG\)\s*$/, "\n");
}

function potSource(kind: "jackpot" | "sequential", protocolDeployer: string): string {
  const raw = kind === "jackpot" ? jackpotSrc : sequentialSrc;
  return stripDeployTimeLogPreInit(qualifyProtocolRefs(raw, protocolDeployer));
}

describe("StacksPotAccelerationProposal — parameter model", () => {
  it("matches the 5-month / 10-cycle program scope", () => {
    expect(PROGRAM_CYCLES).toBe(10);
    expect(POTS_PER_CYCLE).toBe(23);
    expect(TOTAL_POTS).toBe(230);
    expect(SPONSOR_ALLOCATION_STX).toBe(500_000);
    expect(BURN_BLOCKS_PER_POX_CYCLE).toBe(2_100);
    expect(MORE_THAN_ONE_CYCLE).toBe(2_150);
    expect(PROGRAM.potsPerMonth).toBe(TIER_A.potsPerCycle * 2 + TIER_B.potsPerCycle * 2 + TIER_C.potsPerCycle * 2);
    expect(PROGRAM.potsPerMonth).toBe(46);
  });

  it("matches the per-tier pot mix, entry, target, and boost", () => {
    for (const tier of TIERS) {
      expect(tier.potTargetStx).toBe(tier.entryMinStx * tier.minParticipants);
      expect(tier.tierCapitalStx).toBe(tier.boostPerPotStx * tier.potsPerCycle);
    }
    expect(TIER_A.potsPerCycle + TIER_B.potsPerCycle + TIER_C.potsPerCycle).toBe(POTS_PER_CYCLE);
    expect(TIER_A.tierCapitalStx + TIER_B.tierCapitalStx + TIER_C.tierCapitalStx).toBe(SPONSOR_ALLOCATION_STX);
  });

  it("matches Total Stacked = (pot target + boost) × qty × 10 cycles", () => {
    for (const tier of TIERS) {
      const perPotStacked = tier.potTargetStx + tier.boostPerPotStx;
      const totalStacked = perPotStacked * tier.potsPerCycle * PROGRAM_CYCLES;
      expect(totalStacked).toBe(TIER_STATS[tier.id].stackedStx);
    }
    expect(
      TIER_STATS.A.stackedStx + TIER_STATS.B.stackedStx + TIER_STATS.C.stackedStx
    ).toBe(PROGRAM.totalStackedStx);
  });

  it("matches participant and join-tx accounting", () => {
    for (const tier of TIERS) {
      const participants = tier.minParticipants * tier.potsPerCycle * PROGRAM_CYCLES;
      expect(participants).toBe(TIER_STATS[tier.id].participants);
      expect(participants).toBe(TIER_STATS[tier.id].joinTxs);
    }
    expect(
      TIER_STATS.A.participants + TIER_STATS.B.participants + TIER_STATS.C.participants
    ).toBe(PROGRAM.participants);
    expect(PROGRAM.joinTxs).toBe(8_600);
    expect(PROGRAM.monthlyParticipants).toBe(PROGRAM.participants / 5);
  });

  it("matches lifecycle transaction accounting (deploy / activate / start / close)", () => {
    for (const tier of TIERS) {
      const lifecycle = LIFECYCLE_TXS_PER_POT * tier.potsPerCycle * PROGRAM_CYCLES;
      expect(lifecycle).toBe(TIER_STATS[tier.id].lifecycleTxs);
      expect(lifecycle + TIER_STATS[tier.id].joinTxs).toBe(TIER_STATS[tier.id].totalTxs);
    }
    expect(
      TIER_STATS.A.lifecycleTxs + TIER_STATS.B.lifecycleTxs + TIER_STATS.C.lifecycleTxs
    ).toBe(PROGRAM.lifecycleTxs);
    expect(PROGRAM.lifecycleTxs + PROGRAM.joinTxs).toBe(PROGRAM.totalTxs);
    expect(PROGRAM.totalTxs).toBe(9_520);
  });

  it("keeps sponsorship capital reusable (one 500k allocation, not × 10)", () => {
    expect(SPONSOR_ALLOCATION_STX * PROGRAM_CYCLES).toBe(5_000_000);
    expect(SPONSOR_ALLOCATION_STX).toBe(500_000);
  });
});

describe("StacksPotAccelerationProposal — 10-cycle campaign", () => {
  it(
    "deploys 23 pots at PoX cycle N, claims at cycle N+2, and returns the 500k allocation",
    async () => {
      const accounts = simnet.getAccounts();
      const platform = accounts.get("deployer")!;
      const jackpotQualified = potSource("jackpot", platform);
      const sequentialQualified = potSource("sequential", platform);
      let jackpotHashAllowed = false;
      let sequentialHashAllowed = false;
      const namedWallets = [
        accounts.get("wallet_1")!,
        accounts.get("wallet_2")!,
        accounts.get("wallet_3")!,
        accounts.get("wallet_4")!,
        accounts.get("wallet_5")!,
        accounts.get("wallet_6")!,
        accounts.get("wallet_7")!,
        accounts.get("wallet_8")!,
        accounts.get("faucet")!,
      ];

      const sponsor = testnetAddress(900);
      const extraDeployer = testnetAddress(901);
      const thresholdStaker = testnetAddress(902);
      const thresholdStakerB = testnetAddress(903);
      const thresholdStakers = [thresholdStaker, thresholdStakerB];
      const cycleDeployers = [...namedWallets, extraDeployer];
      expect(new Set(cycleDeployers).size).toBe(PROGRAM_CYCLES);
      expect(
        cycleDeployers.every(
          (addr) => addr !== platform && addr !== sponsor && !thresholdStakers.includes(addr)
        )
      ).toBe(true);

      const maxJoins = Math.max(...TIERS.map((t) => t.minParticipants));
      const participants = Array.from({ length: maxJoins }, (_, i) => testnetAddress(1_000 + i));
      expect(participants).not.toContain(platform);
      expect(participants).not.toContain(sponsor);

      simnet.setLocalAccounts([
        ...accounts.values(),
        sponsor,
        extraDeployer,
        thresholdStaker,
        thresholdStakerB,
        ...participants,
      ]);

      simnet.mintSTX(sponsor, BigInt(ustx(SPONSOR_ALLOCATION_STX)));
      simnet.mintSTX(thresholdStaker, THRESHOLD_STAKE_USTX + BigInt(ustx(1_000)));
      simnet.mintSTX(thresholdStakerB, THRESHOLD_STAKE_USTX + BigInt(ustx(1_000)));
      for (const deployer of cycleDeployers) {
        simnet.mintSTX(deployer, BigInt(ustx(1_000)));
      }
      for (const participant of participants) {
        simnet.mintSTX(participant, BigInt(ustx(50_000)));
      }

      const deployedPots: PotRef[] = [];
      const deployersUsed: string[] = [];
      const ledger: TxRow[] = [];
      const reportPath = resolve("reports/StacksPotAccelerationProposal-tx-breakdown.xlsx");

      const potBalances = (pot: PotRef) => {
        const stx = stxBalance(pot.id);
        const btc = unwrapOkUint(
          simnet.callReadOnlyFn(
            "sbtc-token",
            "get-balance",
            [Cl.contractPrincipal(pot.address, pot.name)],
            pot.address
          ).result
        );
        return { stx: formatStx(stx), btc: formatBtc(btc) };
      };

      const record = (
        pot: PotRef,
        functionName: string,
        txArgs: string,
        sender: string,
        result: string,
        before: { stx: string; btc: string }
      ) => {
        ledger.push({
          month: Math.ceil(pot.cycle / 2),
          cycle: pot.cycle,
          tier: pot.tier.id,
          pot: pot.name,
          functionName,
          txArgs,
          sender,
          stacksBlock: simnet.stacksBlockHeight,
          burnBlock: simnet.burnBlockHeight,
          potStxBefore: before.stx,
          potBtcBefore: before.btc,
          result,
        });
      };

      try {
      let joinTxs = 0;
      let deployTxs = 0;
      let activateTxs = 0;
      let closeTxs = 0;

      activateStakingStack(platform, thresholdStakers);
      expect(currentPoxCycle(platform)).toBe(0);

      for (let cycle = 1; cycle <= PROGRAM_CYCLES; cycle += 1) {
        const deployer = cycleDeployers[cycle - 1];
        deployersUsed.push(deployer);
        const cyclePots: PotRef[] = [];

        const startWindow = ensureJoinWindow(platform, thresholdStakers);
        const startPox = startWindow.cycle;
        if (cycle === 1) expect(startPox).toBe(0);
        expect(simnet.burnBlockHeight).toBeLessThan(startWindow.joinEnd);

        const deployPot = (tier: (typeof TIERS)[number], index: number): PotRef => {
          const name = `c${String(cycle).padStart(2, "0")}${tier.id.toLowerCase()}${String(index).padStart(2, "0")}`;
          const source = tier.type === "jackpot" ? jackpotQualified : sequentialQualified;
          const deployed = simnet.deployContract(name, source, { clarityVersion: 6 }, deployer);
          expect(isNotErr(deployed.result), failMsg(`deploy ${name}`, deployed.result)).toBe(true);
          deployTxs += 1;
          const potRef: PotRef = {
            cycle,
            tier,
            index,
            name,
            address: deployer,
            id: `${deployer}.${name}`,
          };
          if (tier.type === "jackpot" && !jackpotHashAllowed) {
            const allow = simnet.callPublicFn(
              "stackspots",
              "set-pot-contract-hash",
              [Cl.contractPrincipal(deployer, name), Cl.bool(true)],
              platform
            );
            expect(isOk(allow.result), failMsg("allow jackpot hash", allow.result)).toBe(true);
              jackpotHashAllowed = true;
          }
          if (tier.type === "sequential" && !sequentialHashAllowed) {
            const allow = simnet.callPublicFn(
              "stackspots",
              "set-pot-contract-hash",
              [Cl.contractPrincipal(deployer, name), Cl.bool(true)],
              platform
            );
            expect(isOk(allow.result), failMsg("allow sequential hash", allow.result)).toBe(true);
              sequentialHashAllowed = true;
          }
          return potRef;
        };

        let cycleBoost = 0;
        let cycleJoins = 0;

        for (const tier of TIERS) {
          for (let i = 0; i < tier.potsPerCycle; i += 1) {
            const headroom = 8 + tier.minParticipants;
            const joinWindow = ensureJoinWindow(platform, thresholdStakers, headroom);
            expect(joinWindow.cycle, `fill left start PoX cycle ${startPox}`).toBe(startPox);
            expect(simnet.burnBlockHeight).toBeLessThan(joinWindow.joinEnd);

            const pot = deployPot(tier, i);
            cyclePots.push(pot);
            expect(simnet.burnBlockHeight, `join ${pot.name} after join-end`).toBeLessThan(joinWindow.joinEnd);
          const self = Cl.contractPrincipal(pot.address, pot.name);
          const init =
            pot.tier.type === "jackpot"
              ? simnet.callPublicFn(
                  pot.id,
                  "init-pot",
                  [
                    Cl.uint(JACKPOT_STAKE_CYCLES),
                    Cl.uint(ustx(pot.tier.entryMinStx)),
                    Cl.uint(pot.tier.minParticipants),
                    Cl.stringAscii(`accel-${pot.name}`),
                    self,
                  ],
                  pot.address
                )
              : simnet.callPublicFn(
                  pot.id,
                  "init-pot",
                  [
                    Cl.uint(ustx(pot.tier.entryMinStx)),
                    Cl.uint(pot.tier.minParticipants),
                    Cl.stringAscii(`accel-${pot.name}`),
                    self,
                  ],
                  pot.address
                );
          expect(isOk(init.result), failMsg(`init ${pot.name}`, init.result)).toBe(true);
          activateTxs += 1;

          const potType = simnet.callReadOnlyFn(pot.id, "get-pot-type", [], pot.address);
          expect(potType.result).toBeOk(Cl.stringAscii(pot.tier.type));
          const minAmount = simnet.callReadOnlyFn(pot.id, "get-pot-min-amount", [], pot.address);
          expect(minAmount.result).toBeOk(Cl.uint(ustx(pot.tier.entryMinStx)));
          const maxParts = simnet.callReadOnlyFn(pot.id, "get-pot-max-participants", [], pot.address);
          expect(maxParts.result).toBeOk(Cl.uint(pot.tier.minParticipants));

          const sponsorBefore = stxBalance(sponsor);
          const sponsorSnap = potBalances(pot);
          const boost = simnet.callPublicFn(
            pot.id,
            "join-pot-as-sponsor",
            [Cl.uint(ustx(pot.tier.boostPerPotStx)), Cl.principal(sponsor)],
            sponsor
          );
          expect(isOk(boost.result), failMsg(`sponsor ${pot.name}`, boost.result)).toBe(true);
          expect(sponsorBefore - stxBalance(sponsor)).toBe(BigInt(ustx(pot.tier.boostPerPotStx)));
          cycleBoost += pot.tier.boostPerPotStx;
          record(
            pot,
            "join-pot-as-sponsor",
            `amount: ${ustx(pot.tier.boostPerPotStx)}, sponsor: ${sponsor}`,
            sponsor,
            isOk(boost.result) ? "ok" : "err",
            sponsorSnap
          );

          for (let p = 0; p < pot.tier.minParticipants; p += 1) {
            const joinSnap = potBalances(pot);
            const join = simnet.callPublicFn(
              pot.id,
              "join-pot",
              [Cl.uint(ustx(pot.tier.entryMinStx))],
              participants[p]
            );
            expect(isOk(join.result), failMsg(`join ${pot.name} #${p}`, join.result)).toBe(true);
            cycleJoins += 1;
            record(
              pot,
              "join-pot",
              `amount: ${ustx(pot.tier.entryMinStx)}`,
              participants[p],
              isOk(join.result) ? "ok" : "err",
              joinSnap
            );
          }

          const value = simnet.callReadOnlyFn(pot.id, "get-pot-value", [], pot.address);
          expect(value.result).toBeOk(
            Cl.uint(ustx(pot.tier.potTargetStx + pot.tier.boostPerPotStx))
          );
          const last = simnet.callReadOnlyFn(pot.id, "get-last-participant", [], pot.address);
          expect(last.result).toBeOk(Cl.uint(pot.tier.minParticipants));

          const startWindows = potPoolConfig(pot.id, pot.address);
          expect(
            simnet.burnBlockHeight,
            `start ${pot.name} must be before join-end ${startWindows.joinEnd}`
          ).toBeLessThan(startWindows.joinEnd);

          const startFn =
            pot.tier.type === "jackpot" ? "start-stackspot-jackpot" : "start-stackspot-sequential-pot";
          const startSnap = potBalances(pot);
          const started = simnet.callPublicFn(
            pot.id,
            startFn,
            [Cl.contractPrincipal(pot.address, pot.name)],
            participants[0]
          );
          expect(isOk(started.result), failMsg(`start ${pot.name}`, started.result)).toBe(true);
          record(
            pot,
            startFn,
            `pot-contract: ${pot.id}`,
            participants[0],
            isOk(started.result) ? "ok" : "err",
            startSnap
          );
          expect(currentPoxCycle(platform), `start ${pot.name} not in PoX cycle ${startPox}`).toBe(startPox);
          }
        }

        expect(cycleBoost).toBe(SPONSOR_ALLOCATION_STX);
        expect(cycleJoins).toBe(
          TIER_A.minParticipants * TIER_A.potsPerCycle +
            TIER_B.minParticipants * TIER_B.potsPerCycle +
            TIER_C.minParticipants * TIER_C.potsPerCycle
        );
        expect(stxBalance(sponsor)).toBe(0n);
        joinTxs += cycleJoins;
        deployedPots.push(...cyclePots);

        expect(cyclePots).toHaveLength(POTS_PER_CYCLE);
        expect(currentPoxCycle(platform)).toBe(startPox);

        const claimPox = startPox + 2;
        mineUntilBurnHeight(platform, claimReleaseHeight(startPox), thresholdStakers);
        expect(currentPoxCycle(platform), "jackpot claim must be PoX cycle start+2").toBe(claimPox);

        const claimAtRewardWindow = (pot: PotRef, round: number | "" = "") => {
          const release = potRewardRelease(pot.id, pot.address);
          if (simnet.burnBlockHeight <= release) {
            mineUntilBurnHeight(platform, release, thresholdStakers);
          }
          expect(
            simnet.burnBlockHeight,
            `claim ${pot.name} before reward-release ${release}`
          ).toBeGreaterThan(release);
          if (pot.tier.type === "jackpot") {
            expect(currentPoxCycle(platform)).toBe(claimPox);
          }
          payoutPotFromFastpool(platform, pot.id, pot.address);
          const claimSnap = potBalances(pot);
          const claimed = simnet.callPublicFn(
            pot.id,
            "claim-pot-reward",
            [Cl.contractPrincipal(pot.address, pot.name)],
            participants[0]
          );
          const label = round === "" ? `claim ${pot.name}` : `claim ${pot.name} #${round}`;
          expect(isOk(claimed.result), failMsg(label, claimed.result)).toBe(true);
          record(
            pot,
            "claim-pot-reward",
            `pot-contract: ${pot.id}`,
            participants[0],
            isOk(claimed.result) ? "ok" : "err",
            claimSnap
          );
        };

        const jackpots = cyclePots.filter((p) => p.tier.type === "jackpot");
        const sequentials = cyclePots.filter((p) => p.tier.type === "sequential");

        for (const pot of jackpots) {
          claimAtRewardWindow(pot);
          closeTxs += 1;
        }

        for (const pot of sequentials) {
          const rounds = pot.tier.minParticipants;
          for (let round = 0; round < rounds; round += 1) {
            claimAtRewardWindow(pot, round);
          }
          closeTxs += 1;
        }

        expect(stxBalance(sponsor)).toBe(BigInt(ustx(SPONSOR_ALLOCATION_STX)));
      }

      expect(deployersUsed).toHaveLength(PROGRAM_CYCLES);
      expect(new Set(deployersUsed).size).toBe(PROGRAM_CYCLES);
      expect(deployedPots).toHaveLength(TOTAL_POTS);
      expect(deployTxs).toBe(TOTAL_POTS);
      expect(activateTxs).toBe(TOTAL_POTS);
      expect(closeTxs).toBe(TOTAL_POTS);
      expect(joinTxs).toBe(PROGRAM.joinTxs);
      expect(stxBalance(sponsor)).toBe(BigInt(ustx(SPONSOR_ALLOCATION_STX)));

      const lastIds = simnet.callReadOnlyFn("stackspots", "get-last-token-id", [], platform);
      expect(lastIds.result).toBeOk(Cl.uint(TOTAL_POTS));

      const byFn = (fn: string) => ledger.filter((r) => r.functionName === fn && r.result === "ok");
      expect(byFn("join-pot")).toHaveLength(PROGRAM.joinTxs);
      expect(byFn("join-pot-as-sponsor")).toHaveLength(TOTAL_POTS);
      expect(
        byFn("start-stackspot-jackpot").length + byFn("start-stackspot-sequential-pot").length
      ).toBe(TOTAL_POTS);
      expect(byFn("claim-pot-reward")).toHaveLength(
        TIER_A.potsPerCycle * PROGRAM_CYCLES +
          TIER_B.potsPerCycle * PROGRAM_CYCLES +
          TIER_C.minParticipants * TIER_C.potsPerCycle * PROGRAM_CYCLES
      );
      expect(ledger.every((r) => r.cycle >= 1 && r.cycle <= PROGRAM_CYCLES)).toBe(true);
      expect(ledger.every((r) => r.month === Math.ceil(r.cycle / 2))).toBe(true);
      } finally {
        await writeAccelerationWorkbook(ledger, reportPath);
      }
    },
    1_800_000
  );
});
