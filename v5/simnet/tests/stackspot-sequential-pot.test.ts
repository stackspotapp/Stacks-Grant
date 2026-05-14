import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

/**
 * Tests for stackspot-sequencial-pot — sequential payouts variant.
 *
 * Differences from jackpot:
 *   - `init-pot` is private and runs at deploy time (so name/type are set).
 *   - `next-payment-id` data-var (default u1) drives sequential winner pick.
 *   - claim-pot-reward picks `(var-get next-payment-id)` as winner-id rather
 *     than VRF-derived index.
 *   - validate-can-claim-pot multiplies reward-release by next-payment-id
 *     (audit finding #6c).
 */

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const POT = "stackspot-sequencial-pot";
const POT_TRAIT = Cl.contractPrincipal(deployer, "stackspot-sequential-pot");

describe("stackspot-sequencial-pot", () => {
  describe("read-only getters (post deploy-time init-pot)", () => {
    it("get-pot-admin = deployer", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-admin", [], wallet1);
      expect(result).toBeOk(Cl.principal(deployer));
    });

    it("get-pot-treasury = current contract", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-treasury", [], wallet1);
      expect(result).toBeOk(Cl.contractPrincipal(deployer, "stackspot-sequential-pot"));
    });

    it("get-last-participant = u0", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-last-participant", [], wallet1);
      expect(result).toBeOk(Cl.uint(0));
    });

    it("get-pot-value = u0", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-value", [], wallet1);
      expect(result).toBeOk(Cl.uint(0));
    });

    it("get-pot-cycle = u1", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-cycle", [], wallet1);
      expect(result).toBeOk(Cl.uint(1));
    });

    it("get-pot-min-amount = u100", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-min-amount", [], wallet1);
      expect(result).toBeOk(Cl.uint(100));
    });

    it("get-pot-max-participants = u100", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-max-participants", [], wallet1);
      expect(result).toBeOk(Cl.uint(100));
    });

    it("get-pot-name set by deploy-time init-pot", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-name", [], wallet1);
      expect(result).toBeOk(Cl.stringAscii("StackSpot Jackpot"));
    });

    it("get-pot-type set by deploy-time init-pot", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-type", [], wallet1);
      expect(result).toBeOk(Cl.stringAscii("StackSpot Jackpot"));
    });

    it("get-pot-reward-token = 'sbtc'", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-reward-token", [], wallet1);
      expect(result).toBeOk(Cl.stringAscii("sbtc"));
    });

    it("is-locked = false initially", () => {
      const { result } = simnet.callReadOnlyFn(POT, "is-locked", [], wallet1);
      expect(result).toBeBool(false);
    });

    it("validate-can-join-pot = true initially", () => {
      const { result } = simnet.callReadOnlyFn(POT, "validate-can-join-pot", [], wallet1);
      expect(result).toBeBool(true);
    });

    it("validate-can-claim-pot = false initially", () => {
      const { result } = simnet.callReadOnlyFn(POT, "validate-can-claim-pot", [], wallet1);
      expect(result).toBeBool(false);
    });

    it("validate-pot-value-target-is-met = false initially", () => {
      const { result } = simnet.callReadOnlyFn(POT, "validate-pot-value-target-is-met", [], wallet1);
      expect(result).toBeBool(false);
    });

    it("get-pot-id returns ok none — not registered", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-id", [], wallet1);
      expect(result).toBeOk(Cl.none());
    });

    it("get-pot-participants returns ok empty list", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-participants", [], wallet1);
      expect(result).toBeOk(Cl.list([]));
    });

    it("next-payment-id starts at u1 (read via getDataVar)", () => {
      const v = simnet.getDataVar(POT, "next-payment-id");
      expect(v).toStrictEqual(Cl.uint(1));
    });
  });

  describe("join-pot", () => {
    it("rejects amount = 0", () => {
      const { result } = simnet.callPublicFn(POT, "join-pot", [Cl.uint(0)], wallet2);
      expect(result).toBeErr(Cl.uint(1302));
    });

    it("rejects amount below min-amount", () => {
      const { result } = simnet.callPublicFn(POT, "join-pot", [Cl.uint(50)], wallet2);
      expect(result).toBeErr(Cl.uint(1302));
    });

    it("rejects POT_ADMIN as participant", () => {
      const { result } = simnet.callPublicFn(POT, "join-pot", [Cl.uint(100)], deployer);
      expect(result).toBeErr(Cl.uint(1101));
    });

    it("happy path: wallet_2 joins", () => {
      const { result } = simnet.callPublicFn(POT, "join-pot", [Cl.uint(100)], wallet2);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("rejects duplicate joiner", () => {
      simnet.callPublicFn(POT, "join-pot", [Cl.uint(100)], wallet2);
      const { result } = simnet.callPublicFn(POT, "join-pot", [Cl.uint(150)], wallet2);
      expect(result).toBeErr(Cl.uint(1104));
    });
  });

  describe("private add-pot-value", () => {
    it("bumps pot-value when called directly", () => {
      simnet.callPrivateFn(POT, "add-pot-value", [Cl.uint(13)], deployer);
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-value", [], wallet1);
      expect(result).toBeOk(Cl.uint(13));
    });
  });

  describe("VRF wiring", () => {
    it("sequential variant does NOT expose get-random-index — winner is `next-payment-id`", () => {
      // Confirm the read-only / public surfaces don't expose it. callReadOnlyFn
      // throws "Method does not exist" if absent.
      expect(() =>
        simnet.callReadOnlyFn(POT, "get-random-index", [Cl.uint(7)], wallet1),
      ).toThrow(/does not exist|Method/);
    });
  });

  describe("cancel-pot / start / claim — pre-state error paths", () => {
    it("cancel-pot rejects with ERR_TOO_EARLY pre-cycle", () => {
      const { result } = simnet.callPublicFn(POT, "cancel-pot", [POT_TRAIT], wallet1);
      expect(result).toBeErr(Cl.uint(1409));
    });

    it("start-stackspot-jackpot rejects with ERR_INSUFFICIENT_REWARD before pot-value target", () => {
      const { result } = simnet.callPublicFn(
        POT,
        "start-stackspot-jackpot",
        [POT_TRAIT],
        wallet1,
      );
      expect(result).toBeErr(Cl.uint(1410));
    });

    it("claim-pot-reward with no participants returns ad-hoc (err u995) — `winner-values` map miss", () => {
      // Sequential pot doesn't use VRF, so it doesn't hit the `mod 0` panic.
      // Instead, with no participants joined yet, the let-binding
      //   (winner-values (unwrap! (map-get? ... pot-winner-id) (err u995)))
      // fires first because pot-winner-id = next-payment-id = u1, and that
      // map slot is empty → graceful error response.
      const { result } = simnet.callPublicFn(POT, "claim-pot-reward", [POT_TRAIT], wallet3);
      expect(result).toBeErr(Cl.uint(995));
    });
  });

  describe("rendezvous invariants", () => {
    it.each([
      "invariant-locked-and-cancelled-exclusive",
      "invariant-lock-burn-height-iff-locked",
      "invariant-locked-implies-starter-set",
      "invariant-pot-value-ge-min-times-participants",
      "invariant-last-participant-bounded",
    ])("%s holds on a fresh pot", (name) => {
      const { result } = simnet.callReadOnlyFn(POT, name, [], deployer);
      expect(result).toBeBool(true);
    });

    it("invariant-next-payment-id-bounded holds on a fresh pot", () => {
      const { result } = simnet.callReadOnlyFn(
        POT,
        "invariant-next-payment-id-bounded",
        [],
        deployer,
      );
      expect(result).toBeBool(true);
    });

    it("invariant-current-target-is-real-participant holds on a fresh pot", () => {
      const { result } = simnet.callReadOnlyFn(
        POT,
        "invariant-current-target-is-real-participant",
        [],
        deployer,
      );
      expect(result).toBeBool(true);
    });

    it("invariant-participant-bimap-consistent holds for any id", () => {
      const { result } = simnet.callReadOnlyFn(
        POT,
        "invariant-participant-bimap-consistent",
        [Cl.uint(0)],
        deployer,
      );
      expect(result).toBeBool(true);
    });
  });
});
