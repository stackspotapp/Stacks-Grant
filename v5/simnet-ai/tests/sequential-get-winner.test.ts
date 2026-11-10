/**
 * Sequential copy: init, three joiners, start, then at each claim window
 * call get-winner (and get-reward-cycles). Claims after each read so the
 * next window’s get-winner advances. Writes reports/sequential-get-winner-run.json.
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
} from "./activate-protocol";
import { winnerFromGetWinner } from "./jackpot-winner";

const STX = 1_000_000;
const JOIN = 1_000 * STX;
const FASTPOOL_LIQ = 1_000_000 * STX;
const JOINERS = 3;

const windows: {
  window: number;
  recordedCycleIndex: number;
  recordedPoxCycle: string;
  burn: number;
  pox: number;
  getWinner: ReturnType<typeof winnerFromGetWinner> | { raw: string };
  getRewardCycles: unknown;
  claim: string;
}[] = [];

function resultLabel(r: { type?: string | number; value?: { value?: unknown } } | undefined): string {
  if (!r) return "none";
  if (r.type === ClarityType.ResponseOk) return "ok";
  if (r.type === ClarityType.ResponseErr) {
    const code = r.value?.value;
    return code === undefined ? "err" : `err u${code}`;
  }
  return JSON.stringify(r);
}

function parseCycles(result: unknown): { index: number; cycle: string }[] {
  const list = (result as { value?: unknown[] })?.value ?? (result as unknown[]);
  if (!Array.isArray(list)) return [{ index: 0, cycle: JSON.stringify(result) }];
  return list.map((item, index) => ({
    index,
    cycle: String((item as { value?: unknown })?.value ?? item),
  }));
}

describe("sequential get-winner at each claim window", () => {
  const accounts = simnet.getAccounts();
  const deployer = accounts.get("deployer")!;
  const j1 = accounts.get("wallet_1")!;
  const j2 = accounts.get("wallet_2")!;
  const j3 = accounts.get("wallet_3")!;
  const lp = accounts.get("wallet_7")!;
  const joiners = [
    { name: "wallet_1", address: j1 },
    { name: "wallet_2", address: j2 },
    { name: "wallet_3", address: j3 },
  ];
  const parties: Record<string, string> = {
    [j1]: "wallet_1",
    [j2]: "wallet_2",
    [j3]: "wallet_3",
    [deployer]: "deployer",
  };

  const potName = "seq-gw";
  const src = readFileSync(resolve("contracts/sequential.clar"), "utf8");
  const initAdminSrc = readFileSync(resolve("contracts/init-admin.clar"), "utf8");
  const pot = `${deployer}.${potName}`;
  const self = Cl.contractPrincipal(deployer, potName);

  function mineToEndOfPoxCycle(targetCycle: number) {
    const exclusive = (targetCycle + 1) * CYCLE_LENGTH - 1;
    if (simnet.burnBlockHeight <= exclusive) {
      mineUntilBurnHeight(deployer, exclusive, [lp]);
    }
    ensureNotPreparePhase(deployer);
    return currentPoxCycle(deployer);
  }

  beforeEach(() => {
    simnet.deployContract("init-admin-late", initAdminSrc, { clarityVersion: 6 }, deployer);
    activateStakingStack(deployer, [lp]);
    simnet.transferSTX(FASTPOOL_LIQ, `${deployer}.fastpool`, lp);
    fundAndStakeFastpoolThreshold(deployer, lp);
    ensureJoinWindow(deployer, [lp], 40);
  });

  afterAll(() => {
    mkdirSync(resolve("reports"), { recursive: true });
    writeFileSync(resolve("reports/sequential-get-winner-run.json"), JSON.stringify(windows, null, 2));
  });

  it("three joiners, get-winner at each of three claim windows", () => {
    const deployed = simnet.deployContract(potName, src, { clarityVersion: 6 }, deployer);
    expect(resultLabel(deployed.result)).toBe("ok");

    const inited = simnet.callPublicFn(
      pot,
      "init-pot",
      [Cl.uint(JOIN), Cl.uint(JOINERS), Cl.stringAscii("sequential-get-winner"), self, Cl.list([])],
      deployer
    );
    expect(resultLabel(inited.result)).toBe("ok");

    for (const joiner of joiners) {
      const joined = simnet.callPublicFn(pot, "join-pot", [Cl.uint(JOIN)], joiner.address);
      expect(resultLabel(joined.result)).toBe("ok");
    }

    ensureJoinWindow(deployer, [lp], 40);
    ensureNotPreparePhase(deployer);
    const poxAtStart = currentPoxCycle(deployer);
    const started = simnet.callPublicFn(pot, "start-pot", [self], deployer);
    expect(resultLabel(started.result)).toBe("ok");

    const recorded = parseCycles(simnet.callReadOnlyFn(pot, "get-reward-cycles", [], deployer).result);
    expect(recorded).toHaveLength(JOINERS);

    for (let window = 1; window <= JOINERS; window++) {
      const targetPox = poxAtStart + window;
      const pox = mineToEndOfPoxCycle(targetPox);
      const gw = simnet.callReadOnlyFn(pot, "get-winner", [], deployer);
      const cycles = simnet.callReadOnlyFn(pot, "get-reward-cycles", [], deployer);
      const parsed = winnerFromGetWinner(gw.result, parties);
      const claim = simnet.callPublicFn(pot, "claim-pot-reward", [self, Cl.list([])], joiners[window - 1].address);

      const row = {
        window,
        recordedCycleIndex: window - 1,
        recordedPoxCycle: recorded[window - 1]?.cycle ?? "none",
        burn: simnet.burnBlockHeight,
        pox,
        getWinner: parsed ?? { raw: JSON.stringify(gw.result) },
        getRewardCycles: parseCycles(cycles.result),
        claim: resultLabel(claim.result),
      };
      windows.push(row);
      console.log(`SEQ-GW window=${window} pox=${pox} get-winner=${JSON.stringify(row.getWinner)} claim=${row.claim}`);
    }

    expect(windows).toHaveLength(JOINERS);
  });
});
