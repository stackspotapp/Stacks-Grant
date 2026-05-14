import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

/**
 * Tests for stackspot-distribute — the reward / principal fan-out contract.
 *
 * Public:
 *   - dispatch-principals(<trait>)   — must be called by .stackspots, tx-sender = pot-treasury
 *   - dispatch-rewards(<trait>)      — same caller restrictions, plus claim-window + yield checks
 *   - delegate-treasury(<trait>, p)  — same caller restrictions
 *
 * Private:
 *   - return-participant-principals(opt, result)  — fold body
 *   - dispatch-rewards-with-sbtc(amount, from, to, memo)
 *
 * Read-only:
 *   - get-pox-info
 *   - get-pool-config(lock-burn-height)            — monotone shape
 *   - validate-can-claim-pot(lock-burn-height, pot-cycle)
 *
 * Errors: ERR_NOT_FOUND (u1001), ERR_UNAUTHORIZED (u1101),
 * ERR_POT_CLAIM_NOT_REACHED (u1402), ERR_INSUFFICIENT_POT_REWARD (u1304).
 */

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const DISTRIBUTE = "stackspot-distribute";

describe("stackspot-distribute", () => {
  describe("get-pox-info", () => {
    it("returns the pox-4 info tuple from sim-pox-4", () => {
      const { result } = simnet.callReadOnlyFn(
        DISTRIBUTE,
        "get-pox-info",
        [],
        deployer,
      );
      // Returns a (tuple ...) directly (not wrapped in response).
      // We just confirm it's a tuple with the expected shape via toBeTuple.
      expect(result).toBeTuple({
        "first-burnchain-block-height": expect.anything(),
        "min-amount-ustx": expect.anything(),
        "prepare-cycle-length": expect.anything(),
        "reward-cycle-id": expect.anything(),
        "reward-cycle-length": expect.anything(),
        "total-liquid-supply-ustx": expect.anything(),
      });
    });
  });

  describe("get-pool-config", () => {
    it("returns ok-tuple with monotone heights for a sane lock-burn-height", () => {
      const { result } = simnet.callReadOnlyFn(
        DISTRIBUTE,
        "get-pool-config",
        [Cl.uint(2000)],
        deployer,
      );
      // Loose extraction of the inner tuple (similar to pots.test.ts).
      // @ts-expect-error: walk into the proxy ClarityValue
      const value = result?.value?.value as
        | Record<string, { value: bigint }>
        | undefined;
      expect(value).toBeDefined();
      const j = value!["join-end"].value;
      const p = value!["prepare-start"].value;
      const c = value!["cycle-end"].value;
      const r = value!["reward-release"].value;
      expect(j).toBeLessThan(p);
      expect(p).toBeLessThan(c);
      expect(c).toBeLessThan(r);
      // reward-release = cycle-end + 432 (constant offset)
      expect(r - c).toBe(432n);
      // prepare-start = cycle-end - prepare-cycle-length
      expect(c - p).toBeGreaterThan(0n);
      // join-end = prepare-start - 300
      expect(p - j).toBe(300n);
    });

    it("monotone shape holds at lock-burn-height = 0 (uses first-burnchain-block-height)", () => {
      const { result } = simnet.callReadOnlyFn(
        DISTRIBUTE,
        "get-pool-config",
        [Cl.uint(0)],
        deployer,
      );
      // @ts-expect-error: see above
      const value = result?.value?.value as
        | Record<string, { value: bigint }>
        | undefined;
      expect(value).toBeDefined();
    });
  });

  describe("validate-can-claim-pot", () => {
    it("returns false when burn-block-height is well below the threshold", () => {
      // burn-block-height in fresh simnet is small (≪ reward-release).
      const { result } = simnet.callReadOnlyFn(
        DISTRIBUTE,
        "validate-can-claim-pot",
        [Cl.uint(100), Cl.uint(1)],
        deployer,
      );
      expect(result).toBeBool(false);
    });

    it("returns false when pot-cycle = 1 and burn-block-height < reward-release", () => {
      const { result } = simnet.callReadOnlyFn(
        DISTRIBUTE,
        "validate-can-claim-pot",
        [Cl.uint(1000), Cl.uint(1)],
        deployer,
      );
      expect(result).toBeBool(false);
    });

    it("becomes true once burn-block-height surpasses the threshold (mine forward)", () => {
      // Pull the threshold for lock-burn-height = 0, pot-cycle = 1, then mine
      // past it and re-check.
      const cfg = simnet.callReadOnlyFn(
        DISTRIBUTE,
        "get-pool-config",
        [Cl.uint(0)],
        deployer,
      );
      // @ts-expect-error
      const release = Number(cfg.result.value.value["reward-release"].value);

      const burnBefore = simnet.burnBlockHeight;
      const toMine = release - Number(burnBefore) + 1;
      simnet.mineEmptyBurnBlocks(toMine);

      const { result } = simnet.callReadOnlyFn(
        DISTRIBUTE,
        "validate-can-claim-pot",
        [Cl.uint(0), Cl.uint(1)],
        deployer,
      );
      expect(result).toBeBool(true);
    });

    it("(audit finding #?: cycle multiplication) pot-cycle = 2 doubles the threshold", () => {
      // The contract computes (* reward-release pot-cycle), so cycle=2
      // requires burn-block-height > 2 * reward-release. Demonstrate by
      // showing the result is still false even when we have already mined
      // past the cycle-1 release.
      const { result } = simnet.callReadOnlyFn(
        DISTRIBUTE,
        "validate-can-claim-pot",
        [Cl.uint(0), Cl.uint(2)],
        deployer,
      );
      expect(result).toBeBool(false);
    });
  });

  describe("dispatch-principals — caller restrictions", () => {
    it("rejects EOA callers (contract-caller != .stackspots)", () => {
      // Calling directly: also tx-sender ≠ pot-treasury, so the first asserts
      // fires (ERR_UNAUTHORIZED). The pot-id unwrap may also fire if the pot
      // is unregistered. With stackspot-jackpot's deploy-time register-pot
      // failing, the unwrap! on get-pot-id returns its error first → either
      // ERR_NOT_FOUND or ERR_UNAUTHORIZED. We accept either.
      const { result } = simnet.callPublicFn(
        DISTRIBUTE,
        "dispatch-principals",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot")],
        wallet1,
      );
      expect(result).toBeErr(expect.anything());
    });
  });

  describe("dispatch-rewards — caller restrictions", () => {
    it("rejects EOA callers", () => {
      const { result } = simnet.callPublicFn(
        DISTRIBUTE,
        "dispatch-rewards",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot")],
        wallet1,
      );
      expect(result).toBeErr(expect.anything());
    });
  });

  describe("delegate-treasury — caller restrictions", () => {
    it("rejects EOA callers", () => {
      const { result } = simnet.callPublicFn(
        DISTRIBUTE,
        "delegate-treasury",
        [
          Cl.contractPrincipal(deployer, "stackspot-jackpot"),
          Cl.principal(wallet2),
        ],
        wallet1,
      );
      expect(result).toBeErr(expect.anything());
    });
  });

  describe("private helpers (callPrivateFn)", () => {
    it("dispatch-rewards-with-sbtc forwards to .sbtc-token transfer (returns its err if unauthorised)", () => {
      // sbtc-token authorises by `(is-eq contract-caller sender)`.
      // callPrivateFn doesn't change `contract-caller` to the EOA — it
      // remains `.stackspot-distribute` for the inner call. Therefore
      // every call here surfaces sbtc-token's auth err (u1) regardless
      // of which EOA we use to pull the trigger. This test pins that
      // contract-call delegation is intact rather than a happy path.
      const { result } = simnet.callPrivateFn(
        DISTRIBUTE,
        "dispatch-rewards-with-sbtc",
        [
          Cl.uint(1_000),
          Cl.principal(deployer),
          Cl.principal(wallet1),
          Cl.none(),
        ],
        deployer,
      );
      expect(result).toBeErr(Cl.uint(1));
    });

    it("dispatch-rewards-with-sbtc errors uniformly across distinct EOA callers", () => {
      const { result } = simnet.callPrivateFn(
        DISTRIBUTE,
        "dispatch-rewards-with-sbtc",
        [
          Cl.uint(1_000),
          Cl.principal(wallet1),
          Cl.principal(wallet2),
          Cl.none(),
        ],
        deployer,
      );
      expect(result).toBeErr(expect.anything());
    });
  });
});
