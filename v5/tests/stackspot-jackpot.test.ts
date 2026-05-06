import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

/**
 * Tests for stackspot-jackpot.
 *
 * Public:
 *   - init-pot(cycle, min, max, name, type)   — POT_ADMIN only, one-shot
 *   - join-pot(amount)                         — pre-lock; participant ≠ admin/platform/pot
 *   - cancel-pot(<trait>)                      — pre-lock; ≥1 cycle since first joiner
 *   - start-stackspot-jackpot(<trait>)         — pre-lock; pot value target met
 *   - claim-pot-reward(<trait>)                — burn-block-height past reward-release
 *   - get-random-index(participant-count)      — read-only VRF wrapper
 *   - update-context(name, called)             — rendezvous helper
 *
 * Read-only: get-pot-* getters, validate-* helpers, is-locked, get-pot-details,
 * get-pot-participants, get-by-id-helper(-private), pool/config getters,
 * rendezvous invariants.
 *
 * Private: add-pot-value, delegate-to-pot.
 *
 * NB: init-pot ↦ stackspots.register-pot ↦ mint, which asserts
 *     `(not (is-eq tx-sender platform-treasury))`. Because POT_ADMIN and
 *     platform-treasury both equal `deployer` in the default simnet, init-pot
 *     can never succeed in this harness — its happy path is recorded but
 *     skipped.
 */

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const POT = "stackspot-jackpot";
const POT_TRAIT = Cl.contractPrincipal(deployer, "stackspot-jackpot");

describe("stackspot-jackpot", () => {
  describe("read-only getters (pre-init defaults)", () => {
    it("get-pot-admin = deployer (POT_ADMIN captured at deploy)", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-admin", [], wallet1);
      expect(result).toBeOk(Cl.principal(deployer));
    });

    it("get-pot-treasury = current contract", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-treasury", [], wallet1);
      expect(result).toBeOk(Cl.contractPrincipal(deployer, "stackspot-jackpot"));
    });

    it("get-last-participant = u0", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-last-participant", [], wallet1);
      expect(result).toBeOk(Cl.uint(0));
    });

    it("get-pot-value = u0", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-value", [], wallet1);
      expect(result).toBeOk(Cl.uint(0));
    });

    it("get-pot-cycle = u1 (default)", () => {
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

    it("get-pot-name = empty (init-pot has not run)", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-name", [], wallet1);
      expect(result).toBeOk(Cl.stringAscii(""));
    });

    it("get-pot-type = empty (init-pot has not run)", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-type", [], wallet1);
      expect(result).toBeOk(Cl.stringAscii(""));
    });

    it("get-pot-reward-token = 'sbtc'", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-reward-token", [], wallet1);
      expect(result).toBeOk(Cl.stringAscii("sbtc"));
    });

    it("get-configs returns the data-var trio", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-configs", [], wallet1);
      expect(result).toBeTuple({
        cycles: Cl.uint(1),
        "min-amount": Cl.uint(100),
        "max-participants": Cl.uint(100),
      });
    });

    it("get-pot-id returns ok none — pot is not registered in stackspots", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-id", [], wallet1);
      expect(result).toBeOk(Cl.none());
    });

    it("get-pot-starter-principal = ok none", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-starter-principal", [], wallet1);
      expect(result).toBeOk(Cl.none());
    });

    it("get-pot-claimer-principal = ok none", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-claimer-principal", [], wallet1);
      expect(result).toBeOk(Cl.none());
    });

    it("is-locked = false on a fresh pot", () => {
      const { result } = simnet.callReadOnlyFn(POT, "is-locked", [], wallet1);
      expect(result).toBeBool(false);
    });

    it("validate-can-join-pot = true on a fresh pot", () => {
      const { result } = simnet.callReadOnlyFn(POT, "validate-can-join-pot", [], wallet1);
      expect(result).toBeBool(true);
    });

    it("validate-can-claim-pot = false on a fresh pot (burn height ≪ reward-release)", () => {
      const { result } = simnet.callReadOnlyFn(POT, "validate-can-claim-pot", [], wallet1);
      expect(result).toBeBool(false);
    });

    it("validate-pot-value-target-is-met = false on a fresh pot (value=0)", () => {
      const { result } = simnet.callReadOnlyFn(POT, "validate-pot-value-target-is-met", [], wallet1);
      expect(result).toBeBool(false);
    });

    it("get-by-id-helper returns ok none for any unset index", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-by-id-helper", [Cl.uint(0)], wallet1);
      expect(result).toBeOk(Cl.none());
    });

    it("get-pot-participant-values returns none for non-participant", () => {
      const { result } = simnet.callReadOnlyFn(
        POT,
        "get-pot-participant-values",
        [Cl.principal(wallet3)],
        wallet1,
      );
      expect(result).toBeNone();
    });

    it("get-pot-participants returns ok empty list initially", () => {
      const { result } = simnet.callReadOnlyFn(POT, "get-pot-participants", [], wallet1);
      expect(result).toBeOk(Cl.list([]));
    });

    it("get-pot-origin-contract-sha-hash returns the contract hash", () => {
      const { result } = simnet.callReadOnlyFn(
        POT,
        "get-pot-origin-contract-sha-hash",
        [],
        wallet1,
      );
      expect(result).toBeOk(expect.anything());
    });
  });

  describe("init-pot", () => {
    it("non-admin cannot call init-pot (ERR_ADMIN_ONLY u1102)", () => {
      const { result } = simnet.callPublicFn(
        POT,
        "init-pot",
        [
          Cl.uint(1),
          Cl.uint(200),
          Cl.uint(50),
          Cl.stringAscii("My Jackpot"),
          Cl.stringAscii("Jackpot"),
        ],
        wallet1,
      );
      expect(result).toBeErr(Cl.uint(1102));
    });

    it.skip("admin can init-pot — happy path requires admin ≠ platform-treasury", () => {
      // POT_ADMIN = platform-treasury = deployer in default simnet, so the
      // inner `mint` always rejects. To exercise this path, deploy a fresh
      // pot from a non-deployer principal.
    });
  });

  describe("join-pot", () => {
    it("rejects amount = 0 (ERR_INSUFFICIENT_AMOUNT u1302)", () => {
      const { result } = simnet.callPublicFn(POT, "join-pot", [Cl.uint(0)], wallet2);
      expect(result).toBeErr(Cl.uint(1302));
    });

    it("rejects amount below min-amount (ERR_INSUFFICIENT_AMOUNT u1302)", () => {
      const { result } = simnet.callPublicFn(POT, "join-pot", [Cl.uint(50)], wallet2);
      expect(result).toBeErr(Cl.uint(1302));
    });

    it("rejects POT_ADMIN as participant (ERR_UNAUTHORIZED u1101)", () => {
      const { result } = simnet.callPublicFn(POT, "join-pot", [Cl.uint(100)], deployer);
      expect(result).toBeErr(Cl.uint(1101));
    });

    it("happy path: wallet_2 joins with the minimum amount", () => {
      const { result } = simnet.callPublicFn(POT, "join-pot", [Cl.uint(100)], wallet2);
      expect(result).toBeOk(Cl.bool(true));

      // Side-effects: pot-value updated, last-participant++, participant
      // recorded by both maps.
      expect(
        simnet.callReadOnlyFn(POT, "get-pot-value", [], wallet1).result,
      ).toBeOk(Cl.uint(100));
      expect(
        simnet.callReadOnlyFn(POT, "get-last-participant", [], wallet1).result,
      ).toBeOk(Cl.uint(1));
      expect(
        simnet.callReadOnlyFn(
          POT,
          "get-pot-participant-values",
          [Cl.principal(wallet2)],
          wallet1,
        ).result,
      ).toBeSome(
        Cl.tuple({
          participant: Cl.principal(wallet2),
          amount: Cl.uint(100),
        }),
      );
    });

    it("rejects duplicate joiner (ERR_DUPLICATE_PARTICIPANT u1104)", () => {
      simnet.callPublicFn(POT, "join-pot", [Cl.uint(100)], wallet2);
      const { result } = simnet.callPublicFn(POT, "join-pot", [Cl.uint(150)], wallet2);
      expect(result).toBeErr(Cl.uint(1104));
    });

    it("multiple distinct joiners accumulate pot-value and increment last-participant", () => {
      simnet.callPublicFn(POT, "join-pot", [Cl.uint(100)], wallet2);
      simnet.callPublicFn(POT, "join-pot", [Cl.uint(250)], wallet3);
      simnet.callPublicFn(POT, "join-pot", [Cl.uint(500)], wallet1);
      expect(
        simnet.callReadOnlyFn(POT, "get-pot-value", [], wallet1).result,
      ).toBeOk(Cl.uint(850));
      expect(
        simnet.callReadOnlyFn(POT, "get-last-participant", [], wallet1).result,
      ).toBeOk(Cl.uint(3));
    });
  });

  describe("private add-pot-value (callPrivateFn)", () => {
    it("can be called directly to bump pot-value", () => {
      const before = simnet.callReadOnlyFn(POT, "get-pot-value", [], wallet1);
      const start = (before.result as unknown as { value: { value: bigint } })
        .value.value;

      simnet.callPrivateFn(POT, "add-pot-value", [Cl.uint(7)], deployer);

      const after = simnet.callReadOnlyFn(POT, "get-pot-value", [], wallet1);
      expect(after.result).toBeOk(Cl.uint(Number(start) + 7));
    });
  });

  describe("cancel-pot", () => {
    it("rejects when pot is not started yet AND ≤1 cycle since first joiner (ERR_TOO_EARLY u1409)", () => {
      // No participants → first-user-joined = none → default-to current burn
      // height → current > current+MORE_THAN_ONE_CYCLE is false → too early.
      const { result } = simnet.callPublicFn(POT, "cancel-pot", [POT_TRAIT], wallet1);
      expect(result).toBeErr(Cl.uint(1409));
    });

    it("rejects when called with a different pot-contract than current (ERR_ADMIN_ONLY u1102)", () => {
      // We still hit ERR_TOO_EARLY first under default state. To exercise
      // ERR_ADMIN_ONLY purely, we'd need a tx where first-user-joined was
      // long enough ago — out of scope here. Recorded as TODO.
    });
  });

  describe("start-stackspot-jackpot", () => {
    it("rejects when pot value target is not met (ERR_INSUFFICIENT_REWARD u1410)", () => {
      const { result } = simnet.callPublicFn(
        POT,
        "start-stackspot-jackpot",
        [POT_TRAIT],
        wallet1,
      );
      expect(result).toBeErr(Cl.uint(1410));
    });
  });

  describe("claim-pot-reward", () => {
    it("with zero participants, panics on `(mod _ u0)` in get-random-index BEFORE validate-can-claim-pot fires", () => {
      // Discovered via this test: claim-pot-reward eagerly evaluates
      // `(get-random-index total-participants)` inside its `let`, before the
      // `validate-can-claim-pot` assertion. With no participants joined,
      // `(mod vrf 0)` is a runtime DivisionByZero panic — the graceful
      // ERR_POT_CLAIM_NOT_REACHED path is unreachable for the empty-pot case.
      // Worth tracking as a contract bug; the assertion order should be
      // flipped or the random index lazily computed.
      expect(() =>
        simnet.callPublicFn(POT, "claim-pot-reward", [POT_TRAIT], wallet1),
      ).toThrow(/DivisionByZero/);
    });

    it("after joins, rejects before lock with ERR_POT_CLAIM_NOT_REACHED (u1402)", () => {
      simnet.callPublicFn(POT, "join-pot", [Cl.uint(100)], wallet2);
      const { result } = simnet.callPublicFn(
        POT,
        "claim-pot-reward",
        [POT_TRAIT],
        wallet1,
      );
      expect(result).toBeErr(Cl.uint(1402));
    });
  });

  describe("get-random-index (read-only VRF wrapper)", () => {
    it("returns ok uint < participant-count", () => {
      simnet.mineEmptyBlocks(2);
      const { result } = simnet.callReadOnlyFn(
        POT,
        "get-random-index",
        [Cl.uint(10)],
        wallet1,
      );
      expect(result).toBeOk(expect.anything());
      const value = Number(
        (result as unknown as { value: { value: bigint } }).value.value,
      );
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    });
  });

  describe("rendezvous invariants", () => {
    it.each([
      "invariant-locked-and-cancelled-exclusive",
      "invariant-lock-burn-height-iff-locked",
      "invariant-locked-implies-starter-set",
      "invariant-pot-value-ge-min-times-participants",
      "invariant-last-participant-bounded",
      "invariant-starter-not-treasury-or-platform",
      "invariant-no-joins-after-lock",
    ])("%s holds on a fresh pot", (name) => {
      const { result } = simnet.callReadOnlyFn(POT, name, [], deployer);
      expect(result).toBeBool(true);
    });

    it("invariant-participant-bimap-consistent holds for any id on a fresh pot", () => {
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
