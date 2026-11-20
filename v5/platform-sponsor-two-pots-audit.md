# `.stackspot-sponsor` two-copy + three-pot QA — 2026-11-20 (settle then pot claim)

Simnet-ai. After join/start and mine to burn **4633**, the harness calls `sim-pox-5.claim-rewards` / `fastpool.claim-rewards` (already crystallized → **err u32**), then `fastpool.settle-staker-rewards` for pots and sponsors. **No** `fastpool.payout` before `claim-pot-reward`.

Recorder: **1 passed**. Evidence: `simnet-ai/reports/platform-sponsor-two-pots-audit-run.json`.

## Summary

| ID | Status | What |
| --- | --- | --- |
| PS07 | **Pass** | `start-pot` **ok** |
| PS08 | **Pass** | Mine to burn **4633** |
| PS12 | **Pass** | `settle-staker-rewards` cycle 1 **ok** for all three pots and both sponsors |
| PS14 | Observed | Extra `claim-rewards` at 4633 **err u32** |
| PS09 | **Pass** | pot-one `claim-pot-reward` **ok** (1 sponsor); STX unlocked |
| PS11 | **Pass** | pot-three `claim-pot-reward` **ok** (no sponsors); STX unlocked |
| PS10 | **Fail** | pot-two `claim-pot-reward` **runtime unwrap** in `claim-one-platform-sponsor`; 500 STX still locked |

## Pot claim

| Pot | Claim list | Result | Post STX | Notes |
| --- | --- | --- | --- | --- |
| pot-one | sponsor-1 | **ok** | 0 | Fastpool paid inside claim; sponsor-1 sBTC **39**; closer `potDeployer` **787** sats |
| pot-two | sponsor-1, sponsor-2 | **runtime unwrap** | 500 STX | Same `claim-one-platform-sponsor` panic as before |
| pot-three | none | **ok** | 0 | Jackpot sBTC to `wallet_3` **4094** and `wallet_5` **3824** (across claimed pots) |

`.fastpool` sBTC: 16,999,998 → **16,991,167**. `.stackspots` **87** sats. Joiners each recovered **200 STX** (pot-one + pot-three).

## Reproduction

```bash
cd v5/simnet-ai
npm test -- tests/platform-sponsor-two-pots-audit.test.ts
```
