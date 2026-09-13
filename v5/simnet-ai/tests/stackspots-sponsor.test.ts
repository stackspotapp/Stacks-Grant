import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  activateStakingStack,
  ensureJoinWindow,
} from "./activate-protocol";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

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

describe("sponsor-platform stackspots log", () => {
  it("rejects log-sponsor-platform from a non-sponsor caller", () => {
    const result = simnet.callPublicFn(
      "stackspots",
      "log-sponsor-platform",
      [Cl.buffer(new Uint8Array(1))],
      wallet1
    );
    expect(result.result).toBeErr(Cl.uint(1110));
  });

  it("prints a sponsor-platform event on stackspots", () => {
    const allowed = simnet.callPublicFn(
      "stackspots",
      "update-platform-sponsor-contract",
      [Cl.contractPrincipal(deployer, "stackspot-sponsor"), Cl.bool(true)],
      deployer
    );
    expect(allowed.result).toBeOk(Cl.bool(true));

    activateStakingStack(deployer, [wallet1, wallet2]);
    ensureJoinWindow(deployer, [wallet1, wallet2]);

    const { result, events } = simnet.callPublicFn(
      "stackspot-sponsor",
      "sponsor-platform",
      [Cl.uint(40_000_000), Cl.uint(10), RULE_LIST],
      deployer
    );
    expect(result).toBeOk(Cl.bool(true));

    const payload = JSON.stringify(events);
    expect(payload).toContain("73706f6e736f722d706c6174666f726d"); // "sponsor-platform"
    expect(payload).toContain(".stackspots");
  });

  it("binds sponsor tickets on pot init and logs them", () => {
    const source = readFileSync(resolve("contracts/jackpot.clar"), "utf8")
      .replaceAll(".stackspot-pots-trait.stackspot-pots-trait", `'${deployer}.stackspot-pots-trait.stackspot-pots-trait`)
      .replaceAll(".stackspot-sponsor-trait.stackspot-sponsor-trait", `'${deployer}.stackspot-sponsor-trait.stackspot-sponsor-trait`)
      .replaceAll(".stackspot-vrf", `'${deployer}.stackspot-vrf`)
      .replaceAll(".stackspots", `'${deployer}.stackspots`)
      .replaceAll(".sim-pox-5", `'${deployer}.sim-pox-5`)
      .replaceAll(".fastpool", `'${deployer}.fastpool`)
      .replaceAll(".sbtc-token", `'${deployer}.sbtc-token`)
      .replace(/\n\(contract-call\? [^\n]+ log-pre-init PRE_INIT_LOG\)\s*$/, "\n");

    const deployed = simnet.deployContract("jp-ticket", source, { clarityVersion: 6 }, wallet1);
    expect(deployed.result).not.toBeErr();

    const allow = simnet.callPublicFn(
      "stackspots",
      "set-pot-contract-hash",
      [Cl.contractPrincipal(wallet1, "jp-ticket"), Cl.bool(true)],
      deployer
    );
    expect(allow.result).toBeOk(Cl.bool(true));

    const self = Cl.contractPrincipal(wallet1, "jp-ticket");
    const sponsor = Cl.contractPrincipal(deployer, "stackspot-sponsor");
    const { result, events } = simnet.callPublicFn(
      `${wallet1}.jp-ticket`,
      "init-pot",
      [
        Cl.uint(1),
        Cl.uint(100_000_000),
        Cl.uint(10),
        Cl.stringAscii("sponsored-jackpot"),
        self,
        Cl.list([sponsor]),
      ],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));

    const ticket = simnet.callReadOnlyFn(
      `${wallet1}.jp-ticket`,
      "get-platform-sponsor-ticket",
      [sponsor],
      wallet1
    );
    expect(ticket.result).toBeOk(Cl.some(Cl.uint(1)));

    const payload = JSON.stringify(events);
    expect(payload).toContain("73706f6e736f722d636f6e7472616374"); // "sponsor-contract"
    expect(payload).toContain("7469636b65742d6964"); // "ticket-id"
  });
});
