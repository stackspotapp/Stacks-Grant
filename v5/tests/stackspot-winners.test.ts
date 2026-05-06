import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

/**
 * Tests for stackspot-winners.
 *
 * Single function: log-winner — print-only event sink.
 * Restricted to contract-caller .stackspot-distribute; any other caller
 * fails with ERR_UNAUTHORIZED (u1101).
 */

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;

const WINNERS = "stackspot-winners";

describe("stackspot-winners", () => {
  describe("log-winner", () => {
    it("rejects callers other than .stackspot-distribute (deployer EOA)", () => {
      const { result } = simnet.callReadOnlyFn(
        WINNERS,
        "log-winner",
        [Cl.bufferFromAscii("payload")],
        deployer,
      );
      expect(result).toBeErr(Cl.uint(1101));
    });

    it("rejects callers other than .stackspot-distribute (random wallet)", () => {
      const { result } = simnet.callReadOnlyFn(
        WINNERS,
        "log-winner",
        [Cl.bufferFromAscii("hello")],
        wallet1,
      );
      expect(result).toBeErr(Cl.uint(1101));
    });
  });
});
