import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

/**
 * Tests for stackspot-registry (filename keeps the "registery" typo).
 *
 * Single function: log-pot — a print-only event sink.
 * Restricted to contract-caller .stackspots; any other caller fails with
 * ERR_UNAUTHORIZED (u1101). Defined as `define-read-only` but emits a print.
 */

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;

const REGISTRY = "stackspot-registry";

describe("stackspot-registry", () => {
  describe("log-pot", () => {
    it("rejects callers other than .stackspots (deployer EOA)", () => {
      const { result } = simnet.callReadOnlyFn(
        REGISTRY,
        "log-pot",
        [Cl.bufferFromAscii("hello")],
        deployer,
      );
      expect(result).toBeErr(Cl.uint(1101));
    });

    it("rejects callers other than .stackspots (random wallet)", () => {
      const { result } = simnet.callReadOnlyFn(
        REGISTRY,
        "log-pot",
        [Cl.bufferFromAscii("payload")],
        wallet1,
      );
      expect(result).toBeErr(Cl.uint(1101));
    });

    it("rejects an empty payload from an unauthorized caller", () => {
      const { result } = simnet.callReadOnlyFn(
        REGISTRY,
        "log-pot",
        [Cl.buffer(new Uint8Array())],
        deployer,
      );
      expect(result).toBeErr(Cl.uint(1101));
    });
  });
});
