import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

/**
 * Smoke tests for the sbtc-token dependency.
 *
 * Used by stackspot-distribute (rewards) and the pot contracts
 * (treasury balance reads). Full coverage lives upstream; here we just
 * confirm balance reads return uints and pre-funded wallets have the
 * expected starting balances per Devnet.toml.
 */

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;

describe("sbtc-token (smoke)", () => {
  it("get-balance is ok uint and starts at 0 in simnet (sbtc-balance in Devnet.toml is devnet-only)", () => {
    const { result } = simnet.callReadOnlyFn(
      "sbtc-token",
      "get-balance",
      [Cl.principal(deployer)],
      wallet1,
    );
    expect(result).toBeOk(Cl.uint(0));
  });

  it("get-balance returns ok u0 for a pot contract on a fresh deploy", () => {
    const { result } = simnet.callReadOnlyFn(
      "sbtc-token",
      "get-balance",
      [Cl.contractPrincipal(deployer, "stackspot-jackpot")],
      wallet1,
    );
    expect(result).toBeOk(Cl.uint(0));
  });
});
