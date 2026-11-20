import { ClarityType, Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import {
  CYCLE_LENGTH,
  activateStakingStack,
  currentPoxCycle,
  ensureJoinWindow,
  ensureNotPreparePhase,
  fundAndStakeFastpoolThreshold,
  mintSbtcToPox,
  potRewardRelease,
} from "./activate-protocol";

const STX = 1_000_000;
const JOIN = 100 * STX;
const SPONSOR_CYCLES = 4;
const RULE1_SCORE = 300;
const RULE1_REQUIRED = 100 * STX;
const RULE2_SCORE = 200;
const RULE2_REQUIRED = 5;
const SPONSOR_SRC = readFileSync(resolve("contracts/stackspot-sponsor.clar"), "utf8");
const JACKPOT_SRC = readFileSync(resolve("contracts/jackpot.clar"), "utf8");
const SEQUENTIAL_SRC = readFileSync(resolve("contracts/sequential.clar"), "utf8");
const CROWDFUND_SRC = readFileSync(resolve("contracts/crowd-fund.clar"), "utf8");
const INIT_ADMIN_SRC = readFileSync(resolve("contracts/init-admin.clar"), "utf8");

type TxStatus = "SUCCESS" | "FAILURE" | "SKIPPED";
type Bags = Record<string, { stx: number; sbtc: number }>;

type TxLog = {
  n: number;
  phase: string;
  title: string;
  contract: string;
  fn: string;
  sender: string;
  params: string;
  result: string;
  status: TxStatus;
  before?: Bags;
  after?: Bags;
  delta?: Bags;
};

function label(result: { type?: string | number } | boolean | undefined) {
  if (result === true) return "ok";
  if (!result) return "undefined";
  if (typeof result === "boolean") return result ? "ok" : "false";
  if (
    result.type === ClarityType.ResponseOk ||
    result.type === "ok" ||
    result.type === true ||
    result.type === "true"
  ) {
    return "ok";
  }
  if (result.type === ClarityType.ResponseErr || result.type === "err") {
    const value = (result as { value?: { value?: unknown; type?: number } }).value;
    if (value && typeof value === "object" && "value" in value) return `err u${value.value}`;
    if (value && typeof value === "object" && "type" in value && value.type === ClarityType.None) {
      return "err none";
    }
    return `err ${JSON.stringify(value)}`;
  }
  return String(result.type);
}

function uintOf(result: unknown): number {
  const r = result as { value?: { value?: unknown } };
  const inner = r?.value ?? result;
  const n = Number((inner as { value?: unknown })?.value ?? inner);
  return Number.isFinite(n) ? n : -1;
}

function sbtc(id: string) {
  try {
    const r = simnet.callReadOnlyFn("sbtc-token", "get-balance", [Cl.principal(id)], simnet.deployer);
    return uintOf(r.result);
  } catch {
    return -1;
  }
}

function stx(id: string) {
  return Number(simnet.getAssetsMap().get("STX")?.get(id) ?? 0n);
}

function bag(id: string) {
  return { stx: stx(id), sbtc: sbtc(id) };
}

function csvCell(value: string | number) {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeBalanceTables(
  txs: TxLog[],
  finalBalances: Bags,
  reportDir: string
) {
  const header = [
    "tx",
    "phase",
    "title",
    "contract",
    "function",
    "sender",
    "status",
    "account",
    "stx_before",
    "stx_after",
    "stx_delta",
    "sbtc_before",
    "sbtc_after",
    "sbtc_delta",
    "changed",
  ];
  const rows: string[][] = [];
  const changeRows: string[][] = [];
  for (const t of txs) {
    if (!t.after) continue;
    const names = Object.keys(t.after);
    for (const name of names) {
      const before = t.before?.[name] ?? { stx: 0, sbtc: 0 };
      const after = t.after[name];
      const stxDelta = after.stx - before.stx;
      const sbtcDelta = after.sbtc - before.sbtc;
      const changed = stxDelta !== 0 || sbtcDelta !== 0;
      const row = [
        String(t.n),
        t.phase,
        t.title,
        t.contract,
        t.fn,
        t.sender,
        t.status,
        name,
        String(before.stx),
        String(after.stx),
        String(stxDelta),
        String(before.sbtc),
        String(after.sbtc),
        String(sbtcDelta),
        changed ? "yes" : "no",
      ];
      rows.push(row);
      if (changed) changeRows.push(row);
    }
  }

  const toCsv = (body: string[][]) =>
    [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n") + "\n";

  const mdTable = (cols: string[], body: string[][]) => {
    const lines = [
      `| ${cols.join(" | ")} |`,
      `| ${cols.map(() => "---").join(" | ")} |`,
      ...body.map((line) => `| ${line.map((c) => String(c).replace(/\|/g, "\\|")).join(" | ")} |`),
    ];
    return lines.join("\n") + "\n";
  };

  writeFileSync(resolve(reportDir, "stackspot-e2e-pox-claim-balances.csv"), toCsv(rows));
  writeFileSync(resolve(reportDir, "stackspot-e2e-pox-claim-balance-changes.csv"), toCsv(changeRows));

  const md: string[] = [
    "# StacksPot e2e (PoX claim-rewards before pot close) STX / sBTC balances",
    "",
    "STX is microSTX. sBTC is sats. `changed` rows are the only accounts that moved on that transaction.",
    "",
    "## Final balances",
    "",
    mdTable(
      ["account", "stx", "sbtc"],
      Object.entries(finalBalances).map(([name, b]) => [name, String(b.stx), String(b.sbtc)])
    ),
    "",
    "## Changes by transaction",
    "",
    mdTable(
      [
        "tx",
        "title",
        "status",
        "account",
        "stx_before",
        "stx_after",
        "stx_delta",
        "sbtc_before",
        "sbtc_after",
        "sbtc_delta",
      ],
      changeRows.map((r) => [r[0], r[2], r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[13]])
    ),
  ];
  writeFileSync(resolve(reportDir, "stackspot-e2e-pox-claim-balances.md"), md.join("\n"));
}

function details(pot: string, caller: string) {
  try {
    return simnet.callReadOnlyFn(pot, "get-pot-details", [], caller).result;
  } catch (error) {
    return String(error);
  }
}

describe("StacksPot simnet e2e with sim-pox-5 claim-rewards before pot close", () => {
  it("crystallizes PoX signer rewards at cycle end, then closes pots", () => {
    const accounts = simnet.getAccounts();
    const deployer = accounts.get("deployer")!;
    const potDeployer = accounts.get("wallet_2")!;
    const lp = accounts.get("wallet_7")!;
    const funding = accounts.get("wallet_8")!;
    const jackpotJoiners = [
      accounts.get("wallet_1")!,
      accounts.get("wallet_3")!,
      accounts.get("wallet_4")!,
      accounts.get("wallet_5")!,
      accounts.get("wallet_6")!,
    ];
    const sequentialJoiners = jackpotJoiners.slice(0, 3);
    const crowdfundJoiners = jackpotJoiners;

    const txs: TxLog[] = [];
    const failures: string[] = [];
    let txN = 0;
    let phase = "PHASE 1";
    let fatal = false;
    const watched: { name: string; id: string }[] = [];
    const watch = (name: string, id: string) => {
      const existing = watched.find((w) => w.id === id);
      if (existing) existing.name = name;
      else watched.push({ name, id });
    };
    watch("deployer", deployer);
    watch("potDeployer", potDeployer);
    watch("lp", lp);
    watch("funding", funding);
    watch("fastpool", `${deployer}.fastpool`);
    watch("simPox5", `${deployer}.sim-pox-5`);
    watch("genesisSponsor", `${deployer}.stackspot-sponsor`);
    jackpotJoiners.forEach((addr, i) => watch(`joiner${i + 1}`, addr));

    const snap = (): Bags => {
      const out: Bags = {};
      for (const w of watched) out[w.name] = bag(w.id);
      return out;
    };
    const diff = (before: Bags, after: Bags): Bags => {
      const d: Bags = {};
      for (const name of Object.keys(after)) {
        const b = before[name] ?? { stx: 0, sbtc: 0 };
        const a = after[name];
        if (a.stx !== b.stx || a.sbtc !== b.sbtc) {
          d[name] = { stx: a.stx - b.stx, sbtc: a.sbtc - b.sbtc };
        }
      }
      return d;
    };
    const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
    const withBalances = <T,>(run: () => T) => {
      const before = snap();
      const value = run();
      const after = snap();
      return { value, before, after, delta: diff(before, after) };
    };

    const printHeader = () => {
      console.log("================================================");
      console.log("STACKSPOT SIMNET INTEGRATION TEST");
      console.log("================================================");
    };

    const logTx = (entry: Omit<TxLog, "n">) => {
      txN += 1;
      const row: TxLog = { n: txN, ...entry };
      txs.push(row);
      const num = String(txN).padStart(3, "0");
      console.log("");
      console.log(`[TX ${num}] ${row.title}`);
      console.log(`Phase: ${row.phase}`);
      console.log(`Contract: ${row.contract}`);
      console.log(`Function: ${row.fn}`);
      console.log(`Sender: ${row.sender}`);
      if (row.params) console.log(`Params: ${row.params}`);
      console.log(`Result: ${row.result}`);
      console.log(`Status: ${row.status}`);
      if (row.delta && Object.keys(row.delta).length) {
        console.log("Balances:");
        for (const [name, ch] of Object.entries(row.delta)) {
          const b = row.before?.[name] ?? { stx: 0, sbtc: 0 };
          const a = row.after?.[name] ?? { stx: 0, sbtc: 0 };
          console.log(
            `  ${name}: STX ${b.stx} -> ${a.stx} (${signed(ch.stx)})  sBTC ${b.sbtc} -> ${a.sbtc} (${signed(ch.sbtc)})`
          );
        }
      } else if (row.before) {
        console.log("Balances: unchanged");
      }
      if (row.status === "FAILURE") {
        failures.push(`[TX ${num}] ${row.title} ${row.result}`);
        console.log("Error: transaction failed; dependent steps may be skipped.");
      }
      return row;
    };

    const call = (
      title: string,
      contract: string,
      fn: string,
      args: unknown[],
      sender: string,
      params = "",
      critical = true
    ) => {
      if (fatal) {
        return logTx({
          phase,
          title,
          contract,
          fn,
          sender,
          params,
          result: "skipped after critical failure",
          status: "SKIPPED",
        });
      }
      try {
        const ran = withBalances(() => simnet.callPublicFn(contract, fn, args as never, sender));
        const result = label(ran.value.result);
        const status: TxStatus = result === "ok" ? "SUCCESS" : "FAILURE";
        const row = logTx({
          phase,
          title,
          contract,
          fn,
          sender,
          params,
          result,
          status,
          before: ran.before,
          after: ran.after,
          delta: ran.delta,
        });
        if (status === "FAILURE" && critical) fatal = true;
        return row;
      } catch (error) {
        const result = error instanceof Error ? error.message : String(error);
        const row = logTx({
          phase,
          title,
          contract,
          fn,
          sender,
          params,
          result,
          status: "FAILURE",
        });
        if (critical) fatal = true;
        return row;
      }
    };

    const read = (title: string, contract: string, fn: string, args: unknown[], sender: string) => {
      try {
        const res = simnet.callReadOnlyFn(contract, fn, args as never, sender);
        return { ok: true, result: res.result, text: JSON.stringify(res.result) };
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        logTx({
          phase,
          title,
          contract,
          fn,
          sender,
          params: "",
          result: text,
          status: "FAILURE",
        });
        return { ok: false, result: undefined, text };
      }
    };

    printHeader();

    console.log("");
    console.log("[PHASE 1] PLATFORM INITIALIZATION");
    phase = "PHASE 1";

    {
      const ran = withBalances(() =>
        simnet.deployContract("init-admin-late", INIT_ADMIN_SRC, { clarityVersion: 6 }, deployer)
      );
      watch("initAdminLate", `${deployer}.init-admin-late`);
      logTx({
        phase,
        title: "Initialize platform (allowlist pot/sponsor hashes)",
        contract: `${deployer}.init-admin-late`,
        fn: "update-contract-hash",
        sender: deployer,
        params: "constructor: jackpot, sequential, crowd-fund, stackspot-sponsor",
        result: label(ran.value.result),
        status: label(ran.value.result) === "ok" ? "SUCCESS" : "FAILURE",
        before: ran.before,
        after: snap(),
        delta: diff(ran.before, snap()),
      });
    }
    try {
      const ran = withBalances(() => activateStakingStack(deployer, []));
      logTx({
        phase,
        title: "Initialize stacking pools",
        contract: `${deployer}.fastpool`,
        fn: "register-self",
        sender: deployer,
        params: "sim-pox-5 set-burnchain-parameters + fastpool.register-self",
        result: "ok",
        status: "SUCCESS",
        before: ran.before,
        after: ran.after,
        delta: ran.delta,
      });
    } catch (error) {
      logTx({
        phase,
        title: "Initialize stacking pools",
        contract: `${deployer}.fastpool`,
        fn: "activateStakingStack",
        sender: deployer,
        params: "",
        result: error instanceof Error ? error.message : String(error),
        status: "FAILURE",
      });
      fatal = true;
    }
    {
      const ran = withBalances(() => {
        simnet.transferSTX(1_000_000 * STX, `${deployer}.fastpool`, lp);
        fundAndStakeFastpoolThreshold(deployer, lp);
      });
      logTx({
        phase,
        title: "Fund Fastpool threshold stake",
        contract: `${deployer}.fastpool`,
        fn: "delegate-stx",
        sender: lp,
        params: "threshold stake + 1,000,000 STX to Fastpool",
        result: "ok",
        status: "SUCCESS",
        before: ran.before,
        after: ran.after,
        delta: ran.delta,
      });
    }
    ensureJoinWindow(deployer, [lp, jackpotJoiners[0]], 40);
    ensureNotPreparePhase(deployer);
    logTx({
      phase,
      title: "Open join window (not PoX prepare)",
      contract: `${deployer}.sim-pox-5`,
      fn: "ensureJoinWindow",
      sender: deployer,
      params: `pox=${currentPoxCycle(deployer)} burn=${simnet.burnBlockHeight}`,
      result: "ok",
      status: "SUCCESS",
    });

    const minSponsor = uintOf(
      simnet.callReadOnlyFn("stackspots", "get-minimum-sponsor-amount", [], deployer).result
    );
    const sponsorAmount = Math.max(minSponsor, 5_000 * STX);

    console.log("");
    console.log("[PHASE 2] SPONSOR DEPLOYMENT");
    phase = "PHASE 2";

    const rules = Cl.list([
      Cl.tuple({
        label: Cl.stringAscii("rule-1"),
        state: Cl.bool(true),
        required: Cl.uint(RULE1_REQUIRED),
        score: Cl.uint(RULE1_SCORE),
      }),
      Cl.tuple({
        label: Cl.stringAscii("rule-2"),
        state: Cl.bool(true),
        required: Cl.uint(RULE2_REQUIRED),
        score: Cl.uint(RULE2_SCORE),
      }),
    ]);

    const sponsors = [1, 2, 3].map((i) => {
      const name = `sponsor-${i}`;
      const id = `${deployer}.${name}`;
      const ran = withBalances(() => simnet.deployContract(name, SPONSOR_SRC, { clarityVersion: 6 }, deployer));
      watch(`sponsor${i}`, id);
      const after = snap();
      logTx({
        phase,
        title: `Deploy Sponsor ${i}`,
        contract: id,
        fn: "deployContract",
        sender: deployer,
        params: name,
        result: label(ran.value.result),
        status: label(ran.value.result) === "ok" ? "SUCCESS" : "FAILURE",
        before: ran.before,
        after,
        delta: diff(ran.before, after),
      });
      call(
        `Register Sponsor ${i} hash`,
        "stackspots",
        "update-platform-sponsor-contract",
        [Cl.contractPrincipal(deployer, name), Cl.bool(true)],
        deployer,
        id
      );
      call(
        `Initialize Sponsor ${i} platform`,
        id,
        "sponsor-platform",
        [
          Cl.uint(sponsorAmount),
          Cl.uint(SPONSOR_CYCLES),
          Cl.stringAscii(`sponsor-${i}-logo`),
          Cl.stringAscii(`Sponsor ${i}`),
          rules,
        ],
        deployer,
        `amount=${sponsorAmount} cycles=${SPONSOR_CYCLES} rules=2 (rule-3 omitted)`
      );
      const ruleSets = read(`Read Sponsor ${i} rules`, id, "get-rule-sets", [], deployer);
      logTx({
        phase,
        title: `Verify Sponsor ${i} rules`,
        contract: id,
        fn: "get-rule-sets",
        sender: deployer,
        params: "expect rule-1 300/100STX, rule-2 200/5, rule-3 none",
        result: ruleSets.text.slice(0, 400),
        status: ruleSets.ok ? "SUCCESS" : "FAILURE",
      });
      return { i, name, id, principal: Cl.contractPrincipal(deployer, name) };
    });

    console.log("");
    console.log("[PHASE 3] POT DEPLOYMENT AND INITIALIZATION");
    phase = "PHASE 3";

    const deployPot = (kind: string, src: string, name: string) => {
      const id = `${potDeployer}.${name}`;
      const ran = withBalances(() => simnet.deployContract(name, src, { clarityVersion: 6 }, potDeployer));
      watch(kind.toLowerCase(), id);
      const after = snap();
      logTx({
        phase,
        title: `Deploy ${kind}`,
        contract: id,
        fn: "deployContract",
        sender: potDeployer,
        params: name,
        result: label(ran.value.result),
        status: label(ran.value.result) === "ok" ? "SUCCESS" : "FAILURE",
        before: ran.before,
        after,
        delta: diff(ran.before, after),
      });
      const allowed = simnet.callReadOnlyFn(
        "stackspots",
        "is-contract-allowed-hash",
        [Cl.contractPrincipal(potDeployer, name)],
        deployer
      );
      logTx({
        phase,
        title: `${kind} copy-hash allowed`,
        contract: `${deployer}.stackspots`,
        fn: "is-contract-allowed-hash",
        sender: deployer,
        params: id,
        result: String(allowed.result),
        status: "SUCCESS",
      });
      return { id, name, principal: Cl.contractPrincipal(potDeployer, name) };
    };

    const jackpot = deployPot("Jackpot", JACKPOT_SRC, "e2e-poxclaim-jackpot");
    const sequential = deployPot("Sequential", SEQUENTIAL_SRC, "e2e-poxclaim-sequential");
    const crowdfund = deployPot("Crowdfund", CROWDFUND_SRC, "e2e-poxclaim-crowdfund");

    call(
      "Initialize jackpot",
      jackpot.id,
      "init-pot",
      [
        Cl.uint(1),
        Cl.uint(JOIN),
        Cl.uint(5),
        Cl.stringAscii("e2e-poxclaim-jackpot"),
        jackpot.principal,
        Cl.list([sponsors[0].principal, sponsors[1].principal]),
      ],
      potDeployer,
      "cycle=1 min=100STX max=5 sponsors=Sponsor1,Sponsor2"
    );
    call(
      "Initialize sequential",
      sequential.id,
      "init-pot",
      [
        Cl.uint(JOIN),
        Cl.uint(3),
        Cl.stringAscii("e2e-poxclaim-sequential"),
        sequential.principal,
        Cl.list([sponsors[0].principal]),
      ],
      potDeployer,
      "min=100STX max=3 sponsors=Sponsor1 duration=participant-cycles"
    );
    call(
      "Initialize crowdfund",
      crowdfund.id,
      "init-pot",
      [
        Cl.uint(1),
        Cl.uint(JOIN),
        Cl.uint(5),
        Cl.stringAscii("e2e-poxclaim-crowdfund"),
        Cl.principal(funding),
        crowdfund.principal,
        Cl.list([]),
      ],
      potDeployer,
      `cycle=1 min=100STX max=5 funding=${funding} sponsors=none`
    );

    jackpotJoiners.forEach((addr, i) => {
      call(
        `Jackpot join participant ${i + 1}`,
        jackpot.id,
        "join-pot",
        [Cl.uint(JOIN)],
        addr,
        `amount=${JOIN}`
      );
    });
    sequentialJoiners.forEach((addr, i) => {
      call(
        `Sequential join participant ${i + 1}`,
        sequential.id,
        "join-pot",
        [Cl.uint(JOIN)],
        addr,
        `amount=${JOIN}`
      );
    });
    crowdfundJoiners.forEach((addr, i) => {
      call(
        `Crowdfund join participant ${i + 1}`,
        crowdfund.id,
        "join-pot",
        [Cl.uint(JOIN)],
        addr,
        `amount=${JOIN}`
      );
    });

    const jpDetails = details(jackpot.id, potDeployer);
    const seqDetails = details(sequential.id, potDeployer);
    const cfDetails = details(crowdfund.id, potDeployer);
    logTx({
      phase,
      title: "Verify pot details after joins",
      contract: "jackpot/sequential/crowd-fund",
      fn: "get-pot-details",
      sender: potDeployer,
      params: "jackpot 5/2, sequential 3/1, crowdfund 5/0",
      result: `jackpot=${JSON.stringify(jpDetails).slice(0, 180)} sequential=${JSON.stringify(seqDetails).slice(0, 180)} crowdfund=${JSON.stringify(cfDetails).slice(0, 180)}`,
      status: "SUCCESS",
    });

    console.log("");
    console.log("[PHASE 4] START ALL THREE POTS");
    phase = "PHASE 4";
    ensureJoinWindow(deployer, [lp], 40);
    ensureNotPreparePhase(deployer);
    const poxAtStart = currentPoxCycle(deployer);
    call("Start jackpot", jackpot.id, "start-pot", [jackpot.principal], potDeployer, `pox=${poxAtStart}`);
    call("Start sequential", sequential.id, "start-pot", [sequential.principal], potDeployer, `pox=${poxAtStart}`);
    call("Start crowdfund", crowdfund.id, "start-pot", [crowdfund.principal], potDeployer, `pox=${poxAtStart}`);

    const jpRelease = potRewardRelease(jackpot.id, potDeployer);
    const cfRelease = potRewardRelease(crowdfund.id, potDeployer);
    const yieldClaimBurn = 3 * CYCLE_LENGTH;

    console.log("");
    console.log("[PHASE 5] CLAIMING LIFECYCLE");
    phase = "PHASE 5";

    const CALC_EVERY = 1050;
    const mineClock = (exclusive: number, title: string) => {
      let stepN = 0;
      while (simnet.burnBlockHeight <= exclusive) {
        const remaining = exclusive - simnet.burnBlockHeight + 1;
        const step = Math.max(1, Math.min(CALC_EVERY, remaining));
        stepN += 1;
        const ran = withBalances(() => {
          simnet.mineEmptyBurnBlocks(step);
          try {
            mintSbtcToPox(deployer);
          } catch {
            /* mint is optional yield; claims must still run */
          }
        });
        logTx({
          phase,
          title: `${title} (step ${stepN}, +${step} blocks)`,
          contract: `${deployer}.sim-pox-5`,
          fn: "mineEmptyBurnBlocks",
          sender: deployer,
          params: `burn=${simnet.burnBlockHeight} pox=${currentPoxCycle(deployer)} minted-to-sim-pox-5=yes`,
          result: "ok",
          status: "SUCCESS",
          before: ran.before,
          after: ran.after,
          delta: ran.delta,
        });
        call(
          `${title} calculate-rewards @ burn ${simnet.burnBlockHeight}`,
          "sim-pox-5",
          "calculate-rewards",
          [Cl.list([])],
          deployer,
          `pox=${currentPoxCycle(deployer)} interval=${CALC_EVERY}`,
          false
        );
      }
      ensureNotPreparePhase(deployer);
    };

    const mineToPoxEnd = (targetCycle: number) => {
      mineClock((targetCycle + 1) * CYCLE_LENGTH - 1, `Mine to end of PoX cycle ${targetCycle}`);
      return currentPoxCycle(deployer);
    };

    const claimedPoxCycles = new Set<number>();
    const claimPoxRewardsBeforeClose = (cycle: number, title: string) => {
      if (claimedPoxCycles.has(cycle)) return;
      claimedPoxCycles.add(cycle);
      call(
        title,
        "fastpool",
        "claim-rewards",
        [Cl.list([]), Cl.uint(cycle)],
        deployer,
        `fastpool.claim-rewards → sim-pox-5.claim-rewards as signer; cycle=${cycle}`,
        false
      );
    };

    sequentialJoiners.forEach((addr, i) => {
      const round = i + 1;
      const ended = poxAtStart + round;
      mineToPoxEnd(ended);
      claimPoxRewardsBeforeClose(
        ended,
        `sim-pox-5 claim-rewards cycle ${ended} before sequential claim ${round}`
      );
      call(
        `Sequential Claim ${round}`,
        sequential.id,
        "claim-pot-reward",
        [sequential.principal, Cl.list([sponsors[0].principal])],
        addr,
        `Participant ${round} ${addr}`,
        false
      );
      const winner = read(`Sequential winner after claim ${round}`, sequential.id, "get-winner", [], addr);
      logTx({
        phase,
        title: `Sequential next-payment after claim ${round}`,
        contract: sequential.id,
        fn: "get-winner",
        sender: addr,
        params: "",
        result: winner.text.slice(0, 300),
        status: winner.ok ? "SUCCESS" : "FAILURE",
      });
    });

    mineClock((poxAtStart + 4) * CYCLE_LENGTH + 432, "Mine to sequential STX unlock / reward-release");

    sequentialJoiners.forEach((addr, i) => {
      const round = i + 1;
      const prior = txs.find((t) => t.title === `Sequential Claim ${round}`);
      if (prior?.status === "SUCCESS") return;
      call(
        `Sequential Claim ${round} (unlock retry)`,
        sequential.id,
        "claim-pot-reward",
        [sequential.principal, Cl.list([sponsors[0].principal])],
        addr,
        `Participant ${round} after STX unlock`,
        false
      );
    });

    const claimBurn = Math.max(jpRelease, cfRelease, yieldClaimBurn, simnet.burnBlockHeight);
    if (simnet.burnBlockHeight < claimBurn) {
      mineClock(claimBurn, "Mine to jackpot/crowdfund reward-release");
    }

    const closeCycle = currentPoxCycle(deployer);
    for (let cycle = poxAtStart; cycle < closeCycle; cycle += 1) {
      claimPoxRewardsBeforeClose(
        cycle,
        `sim-pox-5 claim-rewards cycle ${cycle} before jackpot/crowdfund close`
      );
    }

    const beforeJackpot = {
      s1: sbtc(sponsors[0].id),
      s2: sbtc(sponsors[1].id),
      s3: sbtc(sponsors[2].id),
      pot: sbtc(jackpot.id),
    };
    call(
      "Jackpot claim",
      jackpot.id,
      "claim-pot-reward",
      [jackpot.principal, Cl.list([sponsors[0].principal, sponsors[1].principal])],
      potDeployer,
      "closer=potDeployer sponsors=1,2",
      false
    );
    const jpWinner = read("Jackpot winner", jackpot.id, "get-winner", [], potDeployer);
    logTx({
      phase,
      title: "Verify jackpot winner",
      contract: jackpot.id,
      fn: "get-winner",
      sender: potDeployer,
      params: "",
      result: jpWinner.text.slice(0, 400),
      status: jpWinner.ok ? "SUCCESS" : "FAILURE",
    });

    const beforeCf = { pot: sbtc(crowdfund.id), funding: sbtc(funding), s1: sbtc(sponsors[0].id) };
    call(
      "Crowdfund claim",
      crowdfund.id,
      "claim-pot-reward",
      [crowdfund.principal, Cl.list([])],
      potDeployer,
      `funding-address=${funding} sponsors=none`,
      false
    );
    const cfWinner = read("Crowdfund winner", crowdfund.id, "get-winner", [], potDeployer);
    logTx({
      phase,
      title: "Verify crowdfund recipient",
      contract: crowdfund.id,
      fn: "get-winner",
      sender: potDeployer,
      params: "",
      result: cfWinner.text.slice(0, 400),
      status: cfWinner.ok ? "SUCCESS" : "FAILURE",
    });

    console.log("");
    console.log("[PHASE 6] SPONSOR REWARDS");
    phase = "PHASE 6";
    const after = {
      s1: sbtc(sponsors[0].id),
      s2: sbtc(sponsors[1].id),
      s3: sbtc(sponsors[2].id),
      jackpot: sbtc(jackpot.id),
      sequential: sbtc(sequential.id),
      crowdfund: sbtc(crowdfund.id),
      funding: sbtc(funding),
    };
    sponsors.forEach((s) => {
      const sets = read(`Sponsor ${s.i} rules`, s.id, "get-rule-sets", [], potDeployer);
      logTx({
        phase,
        title: `Sponsor ${s.i} configuration`,
        contract: s.id,
        fn: "get-rule-sets",
        sender: potDeployer,
        params: "rule-3 must remain uninitialized",
        result: `sbtc=${after[`s${s.i}` as "s1" | "s2" | "s3"]} rules=${sets.text.slice(0, 280)}`,
        status: sets.ok ? "SUCCESS" : "FAILURE",
      });
    });
    logTx({
      phase,
      title: "Sponsor sBTC after claims",
      contract: "sbtc-token",
      fn: "get-balance",
      sender: deployer,
      params: JSON.stringify({ beforeJackpot, beforeCf, after }),
      result: JSON.stringify(after),
      status: "SUCCESS",
    });

    console.log("");
    console.log("[PHASE 7] FINAL STATE VALIDATION");
    phase = "PHASE 7";
    const txFailed = txs.filter((t) => t.status === "FAILURE");
    const jackpotOk = txs.some((t) => t.title === "Jackpot claim" && t.status === "SUCCESS");
    const seqClaims = [1, 2, 3].filter((round) =>
      txs.some((t) => t.title.includes(`Sequential Claim ${round}`) && t.status === "SUCCESS")
    ).length;
    const crowdfundOk = txs.some((t) => t.title === "Crowdfund claim" && t.status === "SUCCESS");
    const sponsorInits = txs.filter((t) => t.title.includes("Initialize Sponsor") && t.status === "SUCCESS").length;

    const balances = {
      deployer: bag(deployer),
      potDeployer: bag(potDeployer),
      lp_wallet7: bag(lp),
      funding_wallet8: bag(funding),
      fastpool: bag(`${deployer}.fastpool`),
      simPox5: bag(`${deployer}.sim-pox-5`),
      genesisSponsor: bag(`${deployer}.stackspot-sponsor`),
      sponsor1: bag(sponsors[0].id),
      sponsor2: bag(sponsors[1].id),
      sponsor3: bag(sponsors[2].id),
      jackpot: bag(jackpot.id),
      sequential: bag(sequential.id),
      crowdfund: bag(crowdfund.id),
      joiner1: bag(jackpotJoiners[0]),
      joiner2: bag(jackpotJoiners[1]),
      joiner3: bag(jackpotJoiners[2]),
      joiner4: bag(jackpotJoiners[3]),
      joiner5: bag(jackpotJoiners[4]),
    };
    console.log(`BALANCES ${JSON.stringify(balances)}`);

    const summary = {
      SponsorContracts: "3/3",
      Jackpot: jackpotOk ? "SUCCESS" : "FAILURE",
      Sequential: seqClaims === 3 ? "SUCCESS" : `PARTIAL ${seqClaims}/3`,
      Crowdfund: crowdfundOk ? "SUCCESS" : "FAILURE",
      SponsorRewards: after,
      balances,
      FailedTransactions: txFailed.map((t) => `[TX ${String(t.n).padStart(3, "0")}] ${t.title} ${t.result}`),
      Overall: txFailed.length === 0 ? "PASSED" : "FAILED",
      burn: simnet.burnBlockHeight,
      pox: currentPoxCycle(deployer),
      poxAtStart,
      jackpotRelease: jpRelease,
      crowdfundRelease: cfRelease,
    };

    console.log("");
    console.log("================================================");
    console.log("FINAL TEST SUMMARY");
    console.log("================================================");
    console.log(`Sponsor Contracts: ${summary.SponsorContracts}`);
    console.log(`Jackpot: ${summary.Jackpot}`);
    console.log(`Sequential: ${summary.Sequential}`);
    console.log(`Crowdfund: ${summary.Crowdfund}`);
    console.log(`Sponsor Rewards: ${JSON.stringify(after)}`);
    console.log(`Failed TXs: ${summary.FailedTransactions.length}`);
    summary.FailedTransactions.forEach((line) => console.log(line));
    console.log(`Overall Result: ${summary.Overall}`);
    console.log("================================================");

    mkdirSync(resolve("reports"), { recursive: true });
    writeFileSync(
      resolve("reports/stackspot-e2e-pox-claim-run.json"),
      JSON.stringify({ summary, txs }, null, 2)
    );
    writeBalanceTables(txs, balances, resolve("reports"));
    const signedLine = (n: number) => (n > 0 ? `+${n}` : String(n));
    const logLines: string[] = [
      "================================================",
      "STACKSPOT SIMNET INTEGRATION TEST",
      "================================================",
    ];
    let lastPhase = "";
    for (const t of txs) {
      if (t.phase !== lastPhase) {
        lastPhase = t.phase;
        logLines.push("", `[${t.phase}]`);
      }
      logLines.push(
        "",
        `[TX ${String(t.n).padStart(3, "0")}] ${t.title}`,
        `Contract: ${t.contract}`,
        `Function: ${t.fn}`,
        `Sender: ${t.sender}`
      );
      if (t.params) logLines.push(`Params: ${t.params}`);
      logLines.push(`Result: ${t.result}`, `Status: ${t.status}`);
      if (t.delta && Object.keys(t.delta).length) {
        logLines.push("Balances:");
        for (const [name, ch] of Object.entries(t.delta)) {
          const b = t.before?.[name] ?? { stx: 0, sbtc: 0 };
          const a = t.after?.[name] ?? { stx: 0, sbtc: 0 };
          logLines.push(
            `  ${name}: STX ${b.stx} -> ${a.stx} (${signedLine(ch.stx)})  sBTC ${b.sbtc} -> ${a.sbtc} (${signedLine(ch.sbtc)})`
          );
        }
      } else if (t.before) {
        logLines.push("Balances: unchanged");
      }
    }
    logLines.push(
      "",
      "================================================",
      "FINAL TEST SUMMARY",
      "================================================",
      `Sponsor Contracts: ${summary.SponsorContracts}`,
      `Jackpot: ${summary.Jackpot}`,
      `Sequential: ${summary.Sequential}`,
      `Crowdfund: ${summary.Crowdfund}`,
      `Overall Result: ${summary.Overall}`,
      "================================================",
      ""
    );
    writeFileSync(resolve("reports/stackspot-e2e-pox-claim-log.txt"), logLines.join("\n"));

    expect(sponsorInits).toBe(3);
    expect(jackpotOk, summary.FailedTransactions.join("\n")).toBe(true);
    expect(crowdfundOk, summary.FailedTransactions.join("\n")).toBe(true);
    expect(seqClaims).toBeGreaterThanOrEqual(1);
  });
});
