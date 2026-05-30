import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

const POT_CONTRACTS = [
  "stackspot-jackpot",
  "stackspot-sequential-pot",
  "stackspot-crowdfund",
] as const;

describe("tests for all pots", () => {
  describe("can join pot when not locked", () => {
    for (const pot of POT_CONTRACTS) {
      it(`${pot}: returns true on a fresh, unlocked pot`, () => {
        const { result } = simnet.callReadOnlyFn(
          pot,
          "validate-can-join-pot",
          [],
          deployer,
        );
        expect(result).toBeBool(true);
      });
    }
  });

  // -------------------------------------------------------------------------
  // 6b. MAX_PARTICIPANTS off-by-one
  //
  //     (asserts! (<= index-participants max-participants)
  //               ERR_MAX_PARTICIPANTS_REACHED)
  //
  // `index-participants = (var-get last-participant)` — the *next* slot to
  // be filled. With max-participants = 100 and `<=`, the assertion accepts
  // index 100 (the 101st joiner). It should be `<`, rejecting once the cap
  // is reached.
  //
  // Reproducing this inside vitest requires 101 distinct, STX-funded
  // principals. Default simnet ships with 8 wallets, and there is no
  // signer for arbitrary fresh principals — so the boundary is recorded
  // here as a TODO. Once the harness can produce N>100 signers (or once
  // the pot exposes a test-only setter for `pot-max-participants`), the
  // expected scenario is:
  //
  //     for i in 0..max-participants-1: join-pot succeeds (indices 0..max-1)
  //     join #max:                       MUST fail with ERR_MAX_PARTICIPANTS_REACHED
  //                                      (the off-by-one currently lets it
  //                                       through, and the (max+1)-th map
  //                                       entry is silently dropped from
  //                                       get-pot-participants because
  //                                       stackspot-vrf.LIST_UINT only
  //                                       spans 0..99).
  // -------------------------------------------------------------------------
  describe("6b. join-pot rejects the (max-participants + 1)-th joiner", () => {
    for (const pot of POT_CONTRACTS) {
      it.todo(
        `${pot}: needs 101 funded principals or a test-only ` +
          `set-pot-max-participants entry point — see file comment`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // 6c. validate-can-claim-pot multiplied reward-release
  //
  // Jackpot / crowd-fund:
  //     (reward-release (* (get reward-release pool-config) (var-get pot-cycle)))
  // Sequential:
  //     (reward-release (* (get reward-release pool-config) (var-get next-payment-id)))
  //
  // `reward-release` from get-pool-config is an absolute burn-block height
  // (~939482 on mainnet). Multiplying it by `pot-cycle` or `next-payment-id`
  // pushes the threshold years into the future as those counters move past 1.
  //
  // For pot-cycle = 1 (the only value reachable in default config — set by
  // init-pot, no setter) the bug does not manifest, so a black-box test in
  // the default harness cannot exercise it. The sequential variant *does*
  // observe the bug after the first successful claim (next-payment-id ≥ 2),
  // but reaching that state requires the same 101-participant infrastructure
  // as 6b plus an sBTC yield to be present in the pot treasury — out of
  // scope here.
  //
  // The assertion below is a sanity check: get-pool-config should return Ok
  // and `reward-release > cycle-end > prepare-start > join-end`, which is the
  // monotone shape the multiplied-vs-not formulae diverge on.
  // -------------------------------------------------------------------------
  describe("6c. reward-release threshold is independent of pot-cycle / next-payment-id", () => {
    for (const pot of POT_CONTRACTS) {
      it(`${pot}: get-pool-config returns the expected monotone heights`, () => {
        const { result } = simnet.callReadOnlyFn(
          pot,
          "get-pool-config",
          [],
          deployer,
        );

        // Shape: (response (tuple ...) ...)
        // Pull out the inner tuple. We use a loose runtime check rather than
        // the typed clarity-values matchers because we only need the four
        // uint heights and want an early signal if the trait drifts.
        // @ts-expect-error: loose access into the proxy ClarityValue
        const value = result?.value?.value as
          | Record<string, { value: bigint }>
          | undefined;
        expect(value, "expected (ok (tuple ...))").toBeDefined();

        const joinEnd = value!["join-end"].value;
        const prepareStart = value!["prepare-start"].value;
        const cycleEnd = value!["cycle-end"].value;
        const rewardRelease = value!["reward-release"].value;

        expect(joinEnd).toBeLessThan(prepareStart);
        expect(prepareStart).toBeLessThan(cycleEnd);
        expect(cycleEnd).toBeLessThan(rewardRelease);
      });

      it.todo(
        `${pot}: with pot-cycle / next-payment-id > 1, validate-can-claim-pot ` +
          `does NOT scale the threshold (requires a test-only counter setter)`,
      );
    }
  });
});
