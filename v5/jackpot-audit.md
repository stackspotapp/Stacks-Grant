# `.jackpot` QA — 2026-10-24 (rerun)

Simnet-ai, Clarity 6. Exact-source copies from `wallet_2` after deployer `init-admin-late`. Recorder: **27 passed**. **No contract edits** this run.

SHA-256 `jackpot.clar`: `25167ef70e21468d4bfb0d12de8320cb1b3e70ad3e5e37124c9b459506633088`  
SHA-256 `stackspots.clar`: `8f1d47486ccf918a23dc6c1b2937152a68d53ad3ce4378d3204e951ae6a75bff`  
SHA-256 `init-admin.clar`: `753715b93850d86d544a6a161643898993600ded2c160409e22e45fcf1205c50`

Genesis `.jackpot` now logs `pre-init` to `.stackspot-pre-init-logs`. `init-admin` allowlists `.jackpot` and `.crowd-fund`.

## Summary

**J01 and J02 resolved.** **Open:** J03. Closer / I07 **by design**.

| ID | Status | What |
| --- | --- | --- |
| J01 | **Resolved** | Copy deploy **ok**. |
| J02 | **Resolved** | After `init-admin-late`, genesis jackpot `is-contract-allowed-hash` is **`true`**. |
| J03 | **Open** | `get-winner` is `(decide-winner)` at current `stacks-block-height`. Stored vs reroll **same=true** at the claim block. |
| I07 | **By design** | 5-cycle S3 mid **`ok`** at burn 5254; 1-cycle mid **`err u1408`** at 1054. |
| Closer | By design | First `claim-pot-reward` **ok**; later **err u1303**. |

sBTC on every claimed pot: pre **0** / post **0**. Starter, claimer, winner deltas **0**.

## Winners + sBTC roles

id 0 = p1, 1 = p2, 2 = p3.

### Isolated 1-cycle

| Pot | Winner | Starter | Claimer | pot sBTC |
| --- | --- | --- | --- | --- |
| S1 | **p2** | potDeployer | extra | 0/0 |
| S6 | **p2** | potDeployer | potDeployer | 0/0 |
| G | **p1** | platform | extra | 0/0 |
| E | **p2** | potDeployer | potDeployer | 0/0 |

S1 closer **ok** at burn 4633. G closer **ok** at 2533. E sponsor delta **1000000000**.

### Isolated 5-cycle

S1/S6/E winner **p2**. Same starter/claimer pattern. S1 closer **ok** at burn **13033**. S3 mid-cancel **ok** at 5254.

### 10 pots (all claim **ok**)

Starter **potDeployer**, claimer **extra**, pot 0/0.

| Pot | Cycles | Burn | Winner |
| --- | --- | --- | --- |
| jp1c1 | 1 | 4633 | **p1** |
| jp1c2 | 1 | 4633 | **p3** |
| jp1c3 | 1 | 4633 | **p1** |
| jp1c4 | 1 | 4633 | **p1** |
| jp1c5 | 1 | 4633 | **p3** |
| jp5c1 | 5 | 13033 | **p2** |
| jp5c2 | 5 | 13033 | **p3** |
| jp5c3 | 5 | 13033 | **p3** |
| jp5c4 | 5 | 13033 | **p2** |
| jp10c1 | 10 | 23533 | **p2** |

## Reproduction

```bash
cd v5/simnet-ai
npm test -- tests/one-cycle-jackpot.test.ts tests/five-cycle-jackpot.test.ts tests/ten-pot-jackpot.test.ts
```

Logs: `simnet-ai/reports/jackpot-one-cycle-audit-run.json`, `jackpot-five-cycle-audit-run.json`, `jackpot-ten-pot-audit-run.json`.
