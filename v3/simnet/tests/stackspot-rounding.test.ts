import { Cl, hexToCV, UIntCV } from "@stacks/transactions";
import fs from "fs";
import { beforeEach, describe, expect, it } from "vitest";
import { expectSbtcTransferEvent, expectStxTransferEvent } from "./utils";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;

describe("happy-path", () => {
  beforeEach(() => {
    let txReceipt = simnet.deployContract(
      "stackpot2",
      fs.readFileSync("contracts/stackspot-jackpot.clar").toString(),
      { clarityVersion: 3 },
      address1
    );
    expect(txReceipt.result).toBeOk(Cl.bool(true));

    txReceipt = simnet.callPublicFn(
      "stackspot-admin",
      "add-update-admin-status",
      [Cl.principal(address1), Cl.bool(true)],
      deployer
    );
    expect(txReceipt.result).toBeOk(Cl.bool(true));

    txReceipt = simnet.callPublicFn(
      "stackspot-audited-contracts",
      "update-audited-contract",
      [Cl.principal(`${address1}.stackpot2`), Cl.bool(true)],
      address1
    );
    expect(txReceipt.result).toBeOk(Cl.bool(true));

    txReceipt = simnet.callPublicFn(
      "sbtc-token",
      "protocol-mint",
      [Cl.uint(1000000000000), Cl.principal(deployer), Cl.bufferFromHex("01")],
      "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"
    );
    expect(txReceipt.result).toBeOk(Cl.bool(true));

    txReceipt = simnet.callPublicFn(
      "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sim-pox4-multi-pool-v1",
      "set-pool-pox-address-active",
      [
        Cl.tuple({
          hashbytes: Cl.bufferFromHex(
            "7321b74e2b6a7e949e6c4ad313035b1665095017"
          ),
          version: Cl.bufferFromHex("01"),
        }),
      ],
      deployer
    );
    expect(txReceipt.result).toBeOk(Cl.bool(true));
  });

  it("user can join pot, lock pot, distribute rewards", () => {
    let txReceipt = simnet.callPublicFn(
      `${address1}.stackpot2`,
      "join-pot",
      [Cl.uint(10000000)],
      address2
    );
    expect(txReceipt.result).toBeOk(Cl.bool(true));

    txReceipt = simnet.callPublicFn(
      `${address1}.stackpot2`,
      "start-stackspot-jackpot",
      [Cl.principal(`${address1}.stackpot2`)],
      address1
    );
    expect(txReceipt.result).toBeOk(Cl.bool(true));

    // send rewards to pot
    const rewardAmount = 50;
    txReceipt = simnet.callPublicFn(
      "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token",
      "transfer",
      [
        Cl.uint(rewardAmount),
        Cl.principal(deployer),
        Cl.principal(`${address1}.stackpot2`),
        Cl.none(),
      ],
      deployer
    );
    expect(txReceipt.result).toBeOk(Cl.bool(true));

    // advance to reward release
    const burnHeight = Number(
      (hexToCV(simnet.runSnippet("burn-block-height")) as UIntCV).value
    );
    const config = simnet.callReadOnlyFn(
      `${address1}.stackpot2`,
      "get-pool-config",
      [],
      address1
    );

    const rewardReleaseHeight = Number(
      config.result.value.value["reward-release"].value
    );
    console.log(
      `burnHeight: ${burnHeight}, rewardReleaseHeight: ${rewardReleaseHeight}`
    );
    simnet.mineEmptyBlocks(rewardReleaseHeight - burnHeight + 1);

    // claim rewards
    txReceipt = simnet.callPublicFn(
      `${address1}.stackpot2`,
      "claim-pot-reward",
      [Cl.principal(`${address1}.stackpot2`)],
      address1
    );
    expect(txReceipt.result).toBeOk(Cl.bool(true));

    console.log(
      "events:",
      txReceipt.events.map((e) => e.event)
    );

    expect(txReceipt.events.length).toEqual(14); // 4 sbtc transfers + print event

    // return principal
    expectStxTransferEvent(
      txReceipt.events[1],
      10_000_000,
      `${address1}.stackpot2`,
      address2,
      "0d000000157061727469636970616e74207072696e636970616c"
    );

    // platform royalty is rounded to 0
    // pot fee
    expectSbtcTransferEvent(
      txReceipt.events[3],
      2,
      `${address1}.stackpot2`,
      address1
    );
    // pot starter
    expectSbtcTransferEvent(
      txReceipt.events[5],
      1,
      `${address1}.stackpot2`,
      address1
    );
    // claimer
    expectSbtcTransferEvent(
      txReceipt.events[7],
      1,
      `${address1}.stackpot2`,
      address1
    );
    // winner gets the rest (1 extra)
    expectSbtcTransferEvent(
      txReceipt.events[9],
      46,
      `${address1}.stackpot2`,
      address2
    );
  });
});
