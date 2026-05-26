import { Cl, cvToJSON, cvToValue } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import fs from "fs";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const p1 = accounts.get("wallet_1")!;
const p2 = accounts.get("wallet_2")!;
const p3 = accounts.get("wallet_3")!;
const p4 = accounts.get("wallet_4")!;
const p5 = accounts.get("wallet_5")!;
const p6 = accounts.get("wallet_6")!;
const p7 = accounts.get("wallet_7")!;
const p8 = accounts.get("wallet_8")!;
const p9 = accounts.get("wallet_9")!;

const simPox4 = "sim-pox-4" as const;
const simPox4MultiPoolV1 = "sim-pox-4-multi-pool-v1" as const;

const sbtcToken = "sbtc-token" as const;
const sbtcRegistry = "sbtc-registry" as const;

const stackspotJackpot = "stackspot-jackpot" as const;
const stackspotSequentialPot = "stackspot-sequential-pot" as const;
const stackspotCrowdfund = "stackspot-crowdfund" as const;

describe("tests for all pots", () => {
  it("gets pot info", () => {
    const txReceipt = simnet.callReadOnlyFn(deployer + '.' + stackspotJackpot, "get-pot-details", [], p1);
    expect(txReceipt.result).toBeOk(Cl.tuple({
      "pot-participants-count": Cl.uint(0),
      "pot-value": Cl.uint(0),
      "pot-reward-amount": Cl.uint(0),
      "pot-participant-values": Cl.none(),
      "winners-values": Cl.none(),
      "pot-starter-address": Cl.none(),
      "pot-claimer-address": Cl.none(),
      "pool-config": Cl.tuple({
        "join-end": Cl.uint(700),
        "prepare-start": Cl.uint(1000),
        "cycle-end": Cl.uint(1050),
        "reward-release": Cl.uint(1482),
      }),
      "pot-locked": Cl.bool(false),
      "pot-lock-burn-height": Cl.uint(3),
      "pot-cancelled": Cl.bool(false),
      "is-joined": Cl.none(),
    }));
  });
});
