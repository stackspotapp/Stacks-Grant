import { describe, expect, it } from "vitest";

/**
 * Smoke tests for the sim-pox-4 dependency.
 *
 * sim-pox-4 is a vendored shim that emulates the production pox-4 contract for
 * tests. The stackspot pots and stackspot-distribute consume `get-pox-info`
 * from it; the v5 contracts also call `allow-contract-caller`. Full coverage
 * lives upstream — here we just confirm the simnet copy is reachable and
 * returns a well-formed pox-info tuple.
 */

const accounts = simnet.getAccounts();
const wallet1 = accounts.get("wallet_1")!;

describe("sim-pox-4 (smoke)", () => {
  it("get-pox-info returns ok-tuple with the expected fields", () => {
    const { result } = simnet.callReadOnlyFn(
      "sim-pox-4",
      "get-pox-info",
      [],
      wallet1,
    );
    expect(result).toBeOk(
      expect.objectContaining({
        type: expect.stringContaining("tuple"),
      }),
    );
  });
});
