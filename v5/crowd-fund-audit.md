# `.crowd-fund` / `.stackspot-sponsor` QA — 2026-10-21

Simnet-ai, Clarity 6. Exact-source pots from `wallet_2` after deployer `init-admin-late`. Recorder: **25 passed**.

SHA-256 `crowd-fund.clar`: `2a36b7f1d63cfd56951883dad2ab53b219b06642e8340ef4a8e16345decff009`  
SHA-256 `stackspots.clar`: `95d2c9fc76ee8b466bad4348fa62b45b3bd8ea7731a773cbd13df2376bb2e755`  
SHA-256 `stackspot-sponsor.clar`: `ad08dc87efe536c7860be2c8bb715847305fdc0a6f1bb9cc4b406eec3acd65e6`

Simnet / testnet **does not simulate `stx-account` lock**. `(get locked (stx-account …))` stays **0** after `sim-pox-5.stake`. Observed withdraw/extend/cancel results that depend on that bit are recorder artifacts. The Clarity gates are **as intended**.

## Summary

**No open findings.** I09 is **resolved**.

| ID | Status | What |
| --- | --- | --- |
| I07 | **By design** | Unlocked cancel: first joiner + `more_than_one_cycle`, pot not PoX-locked. 5-cycle S3 mid **`ok`** at burn 5254; 1-cycle mid **`err u1408`** at 1054. |
| I08 | **By design** | `withdraw-principal` allowed when `(stx-account).locked` is 0. Full 40 STX **`ok`** at burn 3 because lock is not simulated. |
| I09 | **Resolved** | Full-amount withdraw is **`ok`** (`>=` gate). |
| I10 | **By design** | `extend-sponsor-platform`: `stake-update` while locked, `stake` while unlocked. Unlocked simnet takes `stake` (`err u19` if already a staker; **`err u1301`** if drained). |
| Closer | By design | Any `tx-sender` may `claim-pot-reward` after unlock. First closer can take 2% of sBTC on the pot. |

Unauthorized `withdraw-principal` / `extend-sponsor-platform` from `wallet_8`: **`err u1304`**. Zero withdraw: **`err u3`**.

## 1-cycle

| Step | Result |
| --- | --- |
| `deployContract` | **ok** |
| `init-pot` (empty and `.stackspot-sponsor`) | **ok** |
| `is-contract-allowed-hash` genesis + copy | `true` |
| S1 `wallet_8` closer, burn 4633 | **ok** |
| S1 / S6 later claims | **err u1303** |
| S2 / S4 cancel at end | **ok**; second **err u1404** |
| S3 / S5 / D cancel early or before start | **err u1408** |
| E `join-pot-as-sponsor` 1000 STX returned on claim | **ok**; sponsor delta **1000000000** |

## 5-cycle

Same as 1-cycle except claim/cancel-at-end at burn **13033**.

| Step | Result |
| --- | --- |
| S3 `cancel-immediately` | **err u1408** |
| S3 `cancel-mid-cycle` burn 5254 | **ok** (I07 by design) |
| D `cancel-before-start` | **err u1408** |
| E pot-sponsor principal on claim | **ok**; delta **1000000000** |

## Platform sponsor withdraw / extend

| Step | Result |
| --- | --- |
| `sponsor-platform` 40 STX, 1 cycle | **ok** (PoX `unlock-burn-height u4200`) |
| `get-sponsor-details.is-locked` | **false** (lock not simulated) |
| unauth withdraw / extend | **err u1304** |
| `withdraw-principal` 40 STX | **ok** (I09; I08 gate as intended) |
| `withdraw-principal` 0 | **err u3** |
| later `withdraw-principal` 10 STX | **err u1301** (empty) |
| `extend-sponsor-platform` | **err u1301** (empty this run) |

## Reproduction

```bash
cd v5/simnet-ai
npx vitest run tests/one-cycle-lifecycle.test.ts tests/five-cycle-lifecycle.test.ts tests/sponsor-withdraw-extend.test.ts --maxWorkers=1
```

Logs: `simnet-ai/reports/one-cycle-audit-run.json`, `simnet-ai/reports/five-cycle-audit-run.json`, `simnet-ai/reports/sponsor-withdraw-extend-run.json`.
