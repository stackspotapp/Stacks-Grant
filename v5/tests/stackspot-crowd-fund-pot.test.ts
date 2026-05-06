import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

/**
 * Tests for stackspot-crowd-fund-pot.
 *
 * Differences from jackpot:
 *   - `init-pot` is private and runs at deploy time (so name/type/funding-address
 *     are set immediately).
 *   - `funding-address` data-var captures `tx-sender` at deploy → in default
 *     simnet that is `deployer`, who is also POT_ADMIN. The contract enforces
 *     that the winner is *always* `funding-address` (audit finding #4).
 */

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const POT = "stackspot-crowd-fund-pot";
const POT_TRAIT = Cl.contractPrincipal(deployer, "stackspot-crowd-fund-pot");

describe("stackspot-crowd-fund-pot", () => {
  describe("read-only getters (post deploy-time init-pot)", () => {
    it("get-pot-admin = deployer", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-admin", [], wallet1);
      expect(result).toBeOk(Cl.principal(deployer));
    });

    it("get-pot-treasury = current contract", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-treasury", [], wallet1);
      expect(result).toBeOk(
        Cl.contractPrincipal(deployer, "stackspot-crowd-fund-pot"),
      );
    });

    it("get-pot-name = 'StackSpot Crowd Fund'", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-name", [], wallet1);
      expect(result).toBeOk(Cl.stringAscii("StackSpot Crowd Fund"));
    });

    it("get-pot-type = 'StackSpot Crowd Fund'", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-type", [], wallet1);
      expect(result).toBeOk(Cl.stringAscii("StackSpot Crowd Fund"));
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

    it("get-pot-reward-token = 'sbtc'", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-reward-token", [], wallet1);
      expect(result).toBeOk(Cl.stringAscii("sbtc"));
    });

    it("is-locked = false", () => {
      const { result } = simnet.callReadOnlyFn(POT, "is-locked", [], wallet1);
      expect(result).toBeBool(false);
    });

    it("validate-can-join-pot = true", () => {
      const { result } = simnet.callReadOnlyFn(POT, "validate-can-join-pot", [], wallet1);
      expect(result).toBeBool(true);
    });

    it("validate-can-claim-pot = false", () => {
      const { result } = simnet.callReadOnlyFn(POT, "validate-can-claim-pot", [], wallet1);
      expect(result).toBeBool(false);
    });

    it("validate-pot-value-target-is-met = false initially", () => {
      const { result } = simnet.callReadOnlyFn(POT, "validate-pot-value-target-is-met", [], wallet1);
      expect(result).toBeBool(false);
    });

    it("funding-address (read via getDataVar) captures the deployer", () => {
      const v = simnet.getDataVar(POT, "funding-address");
      expect(v).toStrictEqual(Cl.principal(deployer));
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

    it("rejects POT_ADMIN", () => {
      const { result } = simnet.callPublicFn(POT, "join-pot", [Cl.uint(100)], deployer);
      expect(result).toBeErr(Cl.uint(1101));
    });

    it("happy path: wallet_2 joins", () => {
      const { result } = simnet.callPublicFn(POT, "join-pot", [Cl.uint(100)], wallet2);
      expect(result).toBeOk(Cl.bool(true));
      expect(
        simnet.callReadOnlyFn(POT, "get-pot-value", [], wallet1).result,
      ).toBeOk(Cl.uint(100));
    });

    it("rejects duplicate joiner", () => {
      simnet.callPublicFn(POT, "join-pot", [Cl.uint(100)], wallet2);
      const { result } = simnet.callPublicFn(POT, "join-pot", [Cl.uint(150)], wallet2);
      expect(result).toBeErr(Cl.uint(1104));
    });
  });

  describe("cancel-pot / start / claim", () => {
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

    it("claim-pot-reward rejects pre-lock with ERR_POT_CLAIM_NOT_REACHED (no `mod 0` here — winner is funding-address)", () => {
      const { result } = simnet.callPublicFn(POT, "claim-pot-reward", [POT_TRAIT], wallet3);
      // Crowd-fund's claim-pot-reward does NOT call get-random-index, so the
      // empty-pot DivisionByZero we saw in jackpot/sequential doesn't occur.
      expect(result).toBeErr(Cl.uint(1402));
    });
  });

  describe("rendezvous invariants", () => {
    it.each([
      "invariant-locked-and-cancelled-exclusive",
      "invariant-lock-burn-height-iff-locked",
      "invariant-locked-implies-starter-set",
      "invariant-pot-value-ge-min-times-participants",
      "invariant-last-participant-bounded",
      "invariant-initiated-true",
    ])("%s holds on a fresh pot", (name) => {
      const { result } = simnet.callReadOnlyFn(POT, name, [], deployer);
      expect(result).toBeBool(true);
    });

    it("invariant-funding-address-not-platform-or-treasury — currently fails because deployer = platform-treasury", () => {
      const { result } = simnet.callReadOnlyFn(
        POT,
        "invariant-funding-address-not-platform-or-treasury",
        [],
        deployer,
      );
      // The invariant requires funding-address ≠ platform AND ≠ treasury.
      // `funding-address = tx-sender at deploy = deployer = platform-treasury`,
      // so the first conjunct is false. This test pins the live state.
      expect(result).toBeBool(false);
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
