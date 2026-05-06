import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

/**
 * Tests for stackspot-vrf — pure read-only helpers.
 *
 *   - get-random-uint-at-block(height): block-hash-derived uint, mixed with tx-sender
 *   - higher-16-le(buff32): buff16 (high 16 bytes — the name is misleading)
 *   - generate-list(start, length): slice of LIST_UINT (0..99)
 *
 * SECURITY NOTE: get-random-uint-at-block is NOT a secure VRF for lottery
 * usage — see audit finding #1. These tests cover behavior, not adequacy.
 */

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;

const VRF = "stackspot-vrf";

describe("stackspot-vrf", () => {
  describe("get-random-uint-at-block", () => {
    it("returns ok with a uint for a valid past stacks-block height", () => {
      simnet.mineEmptyBlocks(3);
      const target = Number(simnet.stacksBlockHeight) - 1;
      const { result } = simnet.callReadOnlyFn(
        VRF,
        "get-random-uint-at-block",
        [Cl.uint(target)],
        deployer,
      );
      expect(result).toBeOk(expect.anything());
    });

    it("panics when height is 0 (height-1 underflows before unwrap!)", () => {
      // Note: this is a contract-level brittleness — `(- u0 u1)` is a Clarity
      // arithmetic underflow, raised before reaching the `unwrap!` that would
      // surface ERR_NOT_FOUND. Callers must ensure `height >= 1`.
      expect(() =>
        simnet.callReadOnlyFn(
          VRF,
          "get-random-uint-at-block",
          [Cl.uint(0)],
          deployer,
        ),
      ).toThrow(/ArithmeticUnderflow|underflow/i);
    });

    it("errors when asked for a height that has not been reached yet", () => {
      const future = Number(simnet.stacksBlockHeight) + 1000;
      const { result } = simnet.callReadOnlyFn(
        VRF,
        "get-random-uint-at-block",
        [Cl.uint(future)],
        deployer,
      );
      expect(result).toBeErr(Cl.uint(1001));
    });

    it("is deterministic for fixed (height, tx-sender)", () => {
      simnet.mineEmptyBlocks(2);
      const target = Number(simnet.stacksBlockHeight) - 1;
      const a = simnet.callReadOnlyFn(
        VRF,
        "get-random-uint-at-block",
        [Cl.uint(target)],
        deployer,
      );
      const b = simnet.callReadOnlyFn(
        VRF,
        "get-random-uint-at-block",
        [Cl.uint(target)],
        deployer,
      );
      expect(a.result).toStrictEqual(b.result);
    });

    it("yields different results across distinct tx-senders at the same block (predictability surface)", () => {
      simnet.mineEmptyBlocks(2);
      const target = Number(simnet.stacksBlockHeight) - 1;
      const a = simnet.callReadOnlyFn(
        VRF,
        "get-random-uint-at-block",
        [Cl.uint(target)],
        deployer,
      );
      const b = simnet.callReadOnlyFn(
        VRF,
        "get-random-uint-at-block",
        [Cl.uint(target)],
        wallet1,
      );
      expect(a.result).not.toStrictEqual(b.result);
    });
  });

  describe("generate-list", () => {
    it("returns the first N uints when start=0, length<=100", () => {
      const { result } = simnet.callReadOnlyFn(
        VRF,
        "generate-list",
        [Cl.uint(0), Cl.uint(5)],
        deployer,
      );
      expect(result).toBeSome(
        Cl.list([Cl.uint(0), Cl.uint(1), Cl.uint(2), Cl.uint(3), Cl.uint(4)]),
      );
    });

    it("returns an empty list for length=0", () => {
      const { result } = simnet.callReadOnlyFn(
        VRF,
        "generate-list",
        [Cl.uint(0), Cl.uint(0)],
        deployer,
      );
      expect(result).toBeSome(Cl.list([]));
    });

    it("returns the full 100-element list for start=0, length=100", () => {
      const { result } = simnet.callReadOnlyFn(
        VRF,
        "generate-list",
        [Cl.uint(0), Cl.uint(100)],
        deployer,
      );
      expect(result).toBeSome(expect.anything());
    });

    it("returns none when start+length exceeds 100 (LIST_UINT cap)", () => {
      const { result } = simnet.callReadOnlyFn(
        VRF,
        "generate-list",
        [Cl.uint(0), Cl.uint(101)],
        deployer,
      );
      expect(result).toBeNone();
    });

    it("returns none when start is out of range", () => {
      const { result } = simnet.callReadOnlyFn(
        VRF,
        "generate-list",
        [Cl.uint(101), Cl.uint(1)],
        deployer,
      );
      expect(result).toBeNone();
    });

    it("can take a non-zero start index (the second arg is end-exclusive, not length)", () => {
      // The contract names the 2nd parameter `length` but passes it straight
      // to `slice?`, which interprets it as the *end* index (exclusive).
      // So (generate-list 95 100) yields [95,96,97,98,99].
      const { result } = simnet.callReadOnlyFn(
        VRF,
        "generate-list",
        [Cl.uint(95), Cl.uint(100)],
        deployer,
      );
      expect(result).toBeSome(
        Cl.list([
          Cl.uint(95),
          Cl.uint(96),
          Cl.uint(97),
          Cl.uint(98),
          Cl.uint(99),
        ]),
      );
    });

    it("returns none when start > end (bug-magnet from misnamed `length` parameter)", () => {
      const { result } = simnet.callReadOnlyFn(
        VRF,
        "generate-list",
        [Cl.uint(95), Cl.uint(5)],
        deployer,
      );
      expect(result).toBeNone();
    });
  });

  describe("higher-16-le", () => {
    it("returns the high-16 bytes of a 32-byte input", () => {
      const buf32 = Cl.bufferFromHex(
        "00112233445566778899aabbccddeeff" + "0123456789abcdef0123456789abcdef",
      );
      const { result } = simnet.callReadOnlyFn(
        VRF,
        "higher-16-le",
        [buf32],
        deployer,
      );
      expect(result).toBeBuff(
        new Uint8Array([
          0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45,
          0x67, 0x89, 0xab, 0xcd, 0xef,
        ]),
      );
    });
  });
});
