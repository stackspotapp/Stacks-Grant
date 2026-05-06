import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

/**
 * Tests for stackspot-admin.
 *
 * Public API:
 *   - add-update-admin-status(admin, enable)        — PRIMARY_ADMIN only
 *   - update-public-pot-deploy-status(enable)       — admin only
 *   - add-pot-contract-hash(contract, state)        — admin only
 *   - is-admin                                      — read-only
 *   - can-deploy-pot                                — read-only
 *   - is-contract-allowed-hash(addr)                — read-only
 *
 * Bootstrap (deploy-time): deployer + wallet_1 are admins;
 * `public-pot-deploy` defaults to true.
 *
 * Errors: ERR_UNAUTHORIZED (u1101), ERR_NOT_FOUND (u1001).
 */

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!; // bootstrapped admin
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const ADMIN = "stackspot-admin";

describe("stackspot-admin", () => {
  describe("bootstrap", () => {
    it("PRIMARY_ADMIN (deployer) is recognised as admin", () => {
      const { result } = simnet.callReadOnlyFn(ADMIN, "is-admin", [], deployer);
      expect(result).toBeBool(true);
    });

    it("hardcoded second bootstrap principal (wallet_1) is recognised as admin", () => {
      const { result } = simnet.callReadOnlyFn(ADMIN, "is-admin", [], wallet1);
      expect(result).toBeBool(true);
    });

    it("a non-bootstrapped principal is not admin", () => {
      const { result } = simnet.callReadOnlyFn(ADMIN, "is-admin", [], wallet3);
      expect(result).toBeBool(false);
    });

    it("can-deploy-pot returns true for any caller because public-pot-deploy=true", () => {
      const { result } = simnet.callReadOnlyFn(
        ADMIN,
        "can-deploy-pot",
        [],
        wallet3,
      );
      expect(result).toBeBool(true);
    });
  });

  describe("add-update-admin-status (PRIMARY_ADMIN-only)", () => {
    it("PRIMARY_ADMIN can promote a new admin", () => {
      const { result } = simnet.callPublicFn(
        ADMIN,
        "add-update-admin-status",
        [Cl.principal(wallet2), Cl.bool(true)],
        deployer,
      );
      expect(result).toBeOk(Cl.bool(true));

      const isAdmin = simnet.callReadOnlyFn(ADMIN, "is-admin", [], wallet2);
      expect(isAdmin.result).toBeBool(true);
    });

    it("PRIMARY_ADMIN can demote an existing admin", () => {
      simnet.callPublicFn(
        ADMIN,
        "add-update-admin-status",
        [Cl.principal(wallet2), Cl.bool(true)],
        deployer,
      );
      const { result } = simnet.callPublicFn(
        ADMIN,
        "add-update-admin-status",
        [Cl.principal(wallet2), Cl.bool(false)],
        deployer,
      );
      expect(result).toBeOk(Cl.bool(true));

      const isAdmin = simnet.callReadOnlyFn(ADMIN, "is-admin", [], wallet2);
      expect(isAdmin.result).toBeBool(false);
    });

    it("non-PRIMARY_ADMIN (even another admin) cannot promote", () => {
      // wallet_1 is bootstrapped admin but is NOT PRIMARY_ADMIN.
      const { result } = simnet.callPublicFn(
        ADMIN,
        "add-update-admin-status",
        [Cl.principal(wallet3), Cl.bool(true)],
        wallet1,
      );
      expect(result).toBeErr(Cl.uint(1101));
    });

    it("non-admin EOA cannot promote", () => {
      const { result } = simnet.callPublicFn(
        ADMIN,
        "add-update-admin-status",
        [Cl.principal(wallet3), Cl.bool(true)],
        wallet3,
      );
      expect(result).toBeErr(Cl.uint(1101));
    });
  });

  describe("update-public-pot-deploy-status (any admin)", () => {
    it("admin (deployer) can disable public deploys", () => {
      const { result } = simnet.callPublicFn(
        ADMIN,
        "update-public-pot-deploy-status",
        [Cl.bool(false)],
        deployer,
      );
      expect(result).toBeOk(Cl.bool(true));

      // After flipping off, non-admins lose can-deploy-pot.
      const { result: cdp } = simnet.callReadOnlyFn(
        ADMIN,
        "can-deploy-pot",
        [],
        wallet3,
      );
      expect(cdp).toBeBool(false);

      // Admins still can.
      const { result: cdpAdmin } = simnet.callReadOnlyFn(
        ADMIN,
        "can-deploy-pot",
        [],
        deployer,
      );
      expect(cdpAdmin).toBeBool(true);
    });

    it("admin (wallet_1) can flip the flag back on", () => {
      simnet.callPublicFn(
        ADMIN,
        "update-public-pot-deploy-status",
        [Cl.bool(false)],
        deployer,
      );
      const { result } = simnet.callPublicFn(
        ADMIN,
        "update-public-pot-deploy-status",
        [Cl.bool(true)],
        wallet1,
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("non-admin cannot toggle public-pot-deploy", () => {
      const { result } = simnet.callPublicFn(
        ADMIN,
        "update-public-pot-deploy-status",
        [Cl.bool(false)],
        wallet3,
      );
      expect(result).toBeErr(Cl.uint(1101));
    });
  });

  describe("set-pot-contract-hash (admin-only)", () => {
    it("admin can register a pot contract hash; is-contract-allowed-hash then returns (some true)", () => {
      const { result } = simnet.callPublicFn(
        ADMIN,
        "set-pot-contract-hash",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot"), Cl.bool(true)],
        deployer,
      );
      expect(result).toBeOk(Cl.bool(true));

      const allowed = simnet.callReadOnlyFn(
        ADMIN,
        "is-contract-allowed-hash",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot")],
        deployer,
      );
      expect(allowed.result).toBeSome(Cl.bool(true));
    });

    it("non-admin cannot register a contract hash", () => {
      const { result } = simnet.callPublicFn(
        ADMIN,
        "set-pot-contract-hash",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot"), Cl.bool(true)],
        wallet3,
      );
      expect(result).toBeErr(Cl.uint(1101));
    });

    it("re-setting the same hash with state=false revokes it (map-set semantics — audit finding #5 fix)", () => {
      simnet.callPublicFn(
        ADMIN,
        "set-pot-contract-hash",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot"), Cl.bool(true)],
        deployer,
      );
      const second = simnet.callPublicFn(
        ADMIN,
        "set-pot-contract-hash",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot"), Cl.bool(false)],
        deployer,
      );
      expect(second.result).toBeOk(Cl.bool(true));

      const allowed = simnet.callReadOnlyFn(
        ADMIN,
        "is-contract-allowed-hash",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot")],
        deployer,
      );
      // The map now holds (some false) — `default-to false` on the caller side
      // turns this into a hard rejection at the register-pot site.
      expect(allowed.result).toBeSome(Cl.bool(false));
    });

    it("references to non-existent contracts panic at trait resolution (NoSuchContract)", () => {
      // The trait parameter `<stackspot-trait>` is resolved by `contract-of`,
      // which raises a runtime panic if the principal doesn't point at a
      // deployed contract. The graceful ERR_NOT_FOUND path is unreachable
      // for absent contracts in practice.
      expect(() =>
        simnet.callPublicFn(
          ADMIN,
          "set-pot-contract-hash",
          [
            Cl.contractPrincipal(deployer, "nonexistent-contract"),
            Cl.bool(true),
          ],
          deployer,
        ),
      ).toThrow(/NoSuchContract|nonexistent-contract/);
    });
  });

  describe("is-contract-allowed-hash", () => {
    it("returns none for a contract whose hash has never been added", () => {
      const { result } = simnet.callReadOnlyFn(
        ADMIN,
        "is-contract-allowed-hash",
        [Cl.contractPrincipal(deployer, "stackspot-distribute")],
        deployer,
      );
      // No entry in `allowed-contract-hash` => map-get? = none, returned as-is.
      expect(result).toBeNone();
    });
  });

  describe("rendezvous property tests", () => {
    it("invariant-primary-admin-always-enabled holds at all times", () => {
      const { result } = simnet.callReadOnlyFn(
        ADMIN,
        "invariant-primary-admin-always-enabled",
        [],
        deployer,
      );
      expect(result).toBeBool(true);
    });

    it("test-non-primary-cannot-promote-admin returns ok when called by non-PRIMARY", () => {
      const { result } = simnet.callPublicFn(
        ADMIN,
        "test-non-primary-cannot-promote-admin",
        [Cl.principal(wallet3)],
        wallet1,
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("test-non-admin-cannot-toggle-public-deploy returns ok when called by non-admin", () => {
      const { result } = simnet.callPublicFn(
        ADMIN,
        "test-non-admin-cannot-toggle-public-deploy",
        [Cl.bool(false)],
        wallet3,
      );
      expect(result).toBeOk(Cl.bool(true));
    });
  });
});
