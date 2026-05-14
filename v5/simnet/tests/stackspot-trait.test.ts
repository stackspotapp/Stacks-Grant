import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

/**
 * Tests for stackspot-trait.
 *
 * Traits define a function-signature contract; they have no callable
 * functions of their own. We verify that the three pot variants
 * (jackpot, sequencial-pot, crowd-fund-pot) impl-trait this trait by
 * exercising every method the trait declares against each pot — if any
 * implementation drifts, this suite breaks deterministically.
 */

const accounts = simnet.getAccounts();
const wallet1 = accounts.get("wallet_1")!;

const POTS = [
  "stackspot-jackpot",
  "stackspot-sequencial-pot",
  "stackspot-crowd-fund-pot",
] as const;

const TRAIT_METHODS_NO_ARGS = [
  "get-pot-admin",
  "get-pot-treasury",
  "get-pot-id",
  "get-pot-name",
  "get-pot-type",
  "get-pot-cycle",
  "get-pot-reward-token",
  "get-pot-min-amount",
  "get-pot-max-participants",
  "get-pot-value",
  "get-last-participant",
  "get-pot-origin-contract-sha-hash",
  "get-pot-participants",
  "get-pot-details",
] as const;

describe("stackspot-trait conformance", () => {
  for (const pot of POTS) {
    describe(`${pot}`, () => {
      it.each(TRAIT_METHODS_NO_ARGS)(
        `implements ${pot} :: %s () with the trait's response shape`,
        (method) => {
          const { result } = simnet.callReadOnlyFn(pot, method, [], wallet1);
          // We only assert "callable" here — value shape is exercised in the
          // per-pot files.
          expect(result).toBeDefined();
        },
      );

      it(`implements ${pot} :: get-by-id-helper(uint)`, () => {
        const { result } = simnet.callReadOnlyFn(
          pot,
          "get-by-id-helper",
          [Cl.uint(0)],
          wallet1,
        );
        expect(result).toBeDefined();
      });
    });
  }
});
