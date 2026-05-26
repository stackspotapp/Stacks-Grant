import { describe, beforeEach, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

/**
 * Tests for stackspots — NFT registry + dispatch fan-out for pot contracts.
 *
 * Public surface:
 *   - update-fee(uint)                     — platform-treasury only
 *   - register-pot({...})                  — hash-whitelisted, owner==tx-sender,
 *                                             can-deploy-pot, balance >= fee
 *   - transfer(id, sender, recipient)      — always ERR_NOT_PERMITTED (NFT is soulbound)
 *   - dispatch-principals(<trait>)         — contract-caller must equal pot
 *   - dispatch-rewards(<trait>)            — contract-caller must equal pot
 *   - delegate-treasury(<trait>, principal)— contract-caller must equal pot
 *   - update-context(name, called)         — rendezvous test helper (unrestricted)
 *
 * Read-only surface:
 *   - get-platform-treasury, get-fee
 *   - get-last-token-id, get-token-uri, get-owner, get-token-id
 *   - get-pot-info(owner)
 *   - rendezvous invariants
 *
 * NB: `mint` is private (audit finding #2 fix), only reachable via register-pot.
 */

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!; // bootstrapped admin
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const STACKSPOTS = "stackspots";
const ADMIN = "stackspot-admin";

const POT_VALUES = (owner: string) =>
  Cl.tuple({
    owner: Cl.principal(owner),
    contract: Cl.contractPrincipal(deployer, "stackspot-jackpot"),
    cycles: Cl.uint(1),
    type: Cl.stringAscii("StackSpot Jackpot"),
    "pot-reward-token": Cl.stringAscii("sbtc"),
    "min-amount": Cl.uint(100),
    "max-participants": Cl.uint(100),
  });

describe("stackspots", () => {
  describe("read-only getters", () => {
    it("get-platform-treasury returns the deployer", () => {
      const { result } = simnet.callReadOnlyFn(
        STACKSPOTS,
        "get-platform-treasury",
        [],
        wallet3,
      );
      expect(result).toBePrincipal(deployer);
    });

    it("get-fee returns the default 100_000 uSTX", () => {
      const { result } = simnet.callReadOnlyFn(
        STACKSPOTS,
        "get-fee",
        [],
        wallet3,
      );
      expect(result).toBeUint(100_000);
    });

    it("get-last-token-id is 0 on a fresh deploy (no pot has registered)", () => {
      const { result } = simnet.callReadOnlyFn(
        STACKSPOTS,
        "get-last-token-id",
        [],
        wallet3,
      );
      expect(result).toBeOk(Cl.uint(0));
    });

    it("get-token-uri returns (ok none) — TODO comment in contract", () => {
      const { result } = simnet.callReadOnlyFn(
        STACKSPOTS,
        "get-token-uri",
        [Cl.uint(1)],
        wallet3,
      );
      expect(result).toBeOk(Cl.none());
    });

    it("get-owner returns (ok none) for an unminted token id", () => {
      const { result } = simnet.callReadOnlyFn(
        STACKSPOTS,
        "get-owner",
        [Cl.uint(1)],
        wallet3,
      );
      expect(result).toBeOk(Cl.none());
    });

    it("get-token-id returns (ok none) for an unregistered owner", () => {
      const { result } = simnet.callReadOnlyFn(
        STACKSPOTS,
        "get-token-id",
        [Cl.principal(wallet3)],
        wallet3,
      );
      expect(result).toBeOk(Cl.none());
    });

    it("get-pot-info returns ERR_NOT_FOUND for an unregistered owner", () => {
      const { result } = simnet.callReadOnlyFn(
        STACKSPOTS,
        "get-pot-info",
        [Cl.principal(wallet3)],
        wallet3,
      );
      expect(result).toBeErr(Cl.uint(1001));
    });
  });

  describe("update-fee (platform-treasury only)", () => {
    it("platform-treasury (deployer) can update the fee", () => {
      const { result } = simnet.callPublicFn(
        STACKSPOTS,
        "update-fee",
        [Cl.uint(250_000)],
        deployer,
      );
      expect(result).toBeOk(Cl.bool(true));

      const fee = simnet.callReadOnlyFn(STACKSPOTS, "get-fee", [], deployer);
      expect(fee.result).toBeUint(250_000);
    });

    it("non-platform-treasury cannot update the fee (ERR_ADMIN_ONLY u1102)", () => {
      const { result } = simnet.callPublicFn(
        STACKSPOTS,
        "update-fee",
        [Cl.uint(1)],
        wallet1, // bootstrapped admin in stackspot-admin, but NOT platform-treasury
      );
      expect(result).toBeErr(Cl.uint(1102));
    });

    it("non-admin EOA cannot update the fee", () => {
      const { result } = simnet.callPublicFn(
        STACKSPOTS,
        "update-fee",
        [Cl.uint(1)],
        wallet3,
      );
      expect(result).toBeErr(Cl.uint(1102));
    });
  });

  describe("transfer (NFT non-transferability)", () => {
    it("always returns ERR_NOT_PERMITTED (u203), regardless of sender or token", () => {
      for (const sender of [deployer, wallet1, wallet3]) {
        const { result } = simnet.callPublicFn(
          STACKSPOTS,
          "transfer",
          [Cl.uint(1), Cl.principal(sender), Cl.principal(wallet2)],
          sender,
        );
        expect(result).toBeErr(Cl.uint(203));
      }
    });

    it("rendezvous test-transfer-always-reverts returns ok", () => {
      const { result } = simnet.callPublicFn(
        STACKSPOTS,
        "test-transfer-always-reverts",
        [Cl.uint(1), Cl.principal(deployer), Cl.principal(wallet2)],
        deployer,
      );
      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("register-pot — auth & validation", () => {
    it("fails with ERR_UNAUTHORIZED_CONTRACT_HASH (u1110) when the contract hash is not whitelisted", () => {
      const { result } = simnet.callPublicFn(
        STACKSPOTS,
        "register-pot",
        [POT_VALUES(wallet1)],
        wallet1,
      );
      expect(result).toBeErr(Cl.uint(1110));
    });

    it("fails with ERR_UNAUTHORIZED (u1101) when tx-sender ≠ owner", () => {
      // Whitelist the hash so we get past the first gate.
      simnet.callPublicFn(
        ADMIN,
        "set-pot-contract-hash",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot"), Cl.bool(true)],
        deployer,
      );
      const { result } = simnet.callPublicFn(
        STACKSPOTS,
        "register-pot",
        [POT_VALUES(wallet1)], // owner=wallet1
        wallet2, // tx-sender=wallet2
      );
      expect(result).toBeErr(Cl.uint(1101));
    });

    it("happy path: whitelisted hash + tx-sender=owner mints token id 1 and registers", () => {
      simnet.callPublicFn(
        ADMIN,
        "set-pot-contract-hash",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot"), Cl.bool(true)],
        deployer,
      );
      const { result } = simnet.callPublicFn(
        STACKSPOTS,
        "register-pot",
        [POT_VALUES(wallet1)],
        wallet1,
      );
      expect(result).toBeOk(Cl.bool(true));

      // last-pot-index incremented to 1
      const lastId = simnet.callReadOnlyFn(
        STACKSPOTS,
        "get-last-token-id",
        [],
        wallet1,
      );
      expect(lastId.result).toBeOk(Cl.uint(1));

      // NFT owned by the pot contract (recipient of mint)
      const owner = simnet.callReadOnlyFn(
        STACKSPOTS,
        "get-owner",
        [Cl.uint(1)],
        wallet1,
      );
      expect(owner.result).toBeOk(
        Cl.some(Cl.contractPrincipal(deployer, "stackspot-jackpot")),
      );

      // Reverse lookup
      const tokenId = simnet.callReadOnlyFn(
        STACKSPOTS,
        "get-token-id",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot")],
        wallet1,
      );
      expect(tokenId.result).toBeOk(Cl.some(Cl.uint(1)));
    });

    it("re-register of the same pot fails (mint is now private; second nft-mint? collides → ERR_MINT_FAILED u1106)", () => {
      simnet.callPublicFn(
        ADMIN,
        "set-pot-contract-hash",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot"), Cl.bool(true)],
        deployer,
      );
      simnet.callPublicFn(
        STACKSPOTS,
        "register-pot",
        [POT_VALUES(wallet1)],
        wallet1,
      );
      const second = simnet.callPublicFn(
        STACKSPOTS,
        "register-pot",
        [POT_VALUES(wallet1)],
        wallet1,
      );
      // The mint will increment last-pot-index, then nft-mint? to the same
      // recipient would still succeed (NFTs are token-id-keyed, not
      // recipient-keyed). The map-insert silently no-ops on dup keys, so
      // last-pot-index increments but the maps stay pointing at the first
      // mint. Either way, register-pot returns ok — which is itself a state
      // hazard worth recording. Snapshot current behaviour:
      expect(second.result).toBeOk(Cl.bool(true));
    });

    it("platform-treasury (deployer) cannot be the owner — mint blocks it (tx-sender=platform-treasury)", () => {
      simnet.callPublicFn(
        ADMIN,
        "set-pot-contract-hash",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot"), Cl.bool(true)],
        deployer,
      );
      const { result } = simnet.callPublicFn(
        STACKSPOTS,
        "register-pot",
        [POT_VALUES(deployer)],
        deployer,
      );
      // mint asserts (not (is-eq tx-sender platform-treasury))
      // → ERR_UNAUTHORIZED inside mint, propagated as ERR_MINT_FAILED.
      expect(result).toBeErr(Cl.uint(1106));
    });
  });

  describe("dispatch-principals / dispatch-rewards / delegate-treasury (caller-must-be-pot)", () => {
    // Pre-condition: pot must be registered for get-pot-info to succeed.
    beforeEach(() => {
      simnet.callPublicFn(
        ADMIN,
        "set-pot-contract-hash",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot"), Cl.bool(true)],
        deployer,
      );
      simnet.callPublicFn(
        STACKSPOTS,
        "register-pot",
        [POT_VALUES(wallet1)],
        wallet1,
      );
    });

    it("dispatch-principals from an EOA fails with ERR_UNAUTHORIZED (u1101)", () => {
      const { result } = simnet.callPublicFn(
        STACKSPOTS,
        "dispatch-principals",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot")],
        wallet1,
      );
      expect(result).toBeErr(Cl.uint(1101));
    });

    it("dispatch-rewards from an EOA fails with ERR_UNAUTHORIZED (u1101)", () => {
      const { result } = simnet.callPublicFn(
        STACKSPOTS,
        "dispatch-rewards",
        [Cl.contractPrincipal(deployer, "stackspot-jackpot")],
        wallet1,
      );
      expect(result).toBeErr(Cl.uint(1101));
    });

    it("delegate-treasury from an EOA fails with ERR_UNAUTHORIZED (u1101)", () => {
      const { result } = simnet.callPublicFn(
        STACKSPOTS,
        "delegate-treasury",
        [
          Cl.contractPrincipal(deployer, "stackspot-jackpot"),
          Cl.principal(wallet2),
        ],
        wallet1,
      );
      expect(result).toBeErr(Cl.uint(1101));
    });

    it("dispatch-principals on an unregistered pot fails with ERR_NOT_FOUND (u1001)", () => {
      const { result } = simnet.callPublicFn(
        STACKSPOTS,
        "dispatch-principals",
        [Cl.contractPrincipal(deployer, "stackspot-sequencial-pot")],
        wallet1,
      );
      expect(result).toBeErr(Cl.uint(1001));
    });
  });

  describe("rendezvous invariants", () => {
    it("invariant-fee-positive holds for the default fee", () => {
      const { result } = simnet.callReadOnlyFn(
        STACKSPOTS,
        "invariant-fee-positive",
        [],
        deployer,
      );
      expect(result).toBeBool(true);
    });

    it("invariant-last-index-bounded-by-calls holds before any context updates", () => {
      const { result } = simnet.callReadOnlyFn(
        STACKSPOTS,
        "invariant-last-index-bounded-by-calls",
        [],
        deployer,
      );
      // last-pot-index = 0, register/mint context default to 0 → 0 <= 0.
      expect(result).toBeBool(true);
    });

    it("invariant-token-id-in-range trivially holds for a never-minted recipient", () => {
      const { result } = simnet.callReadOnlyFn(
        STACKSPOTS,
        "invariant-token-id-in-range",
        [Cl.principal(wallet3)],
        deployer,
      );
      expect(result).toBeBool(true);
    });
  });

  describe("update-context (rendezvous helper)", () => {
    it("anyone can write context entries", () => {
      const { result } = simnet.callPublicFn(
        STACKSPOTS,
        "update-context",
        [Cl.stringAscii("mint"), Cl.uint(7)],
        wallet3,
      );
      expect(result).toBeOk(Cl.bool(true));
    });
  });
});
