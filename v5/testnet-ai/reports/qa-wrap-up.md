# StacksPot v5 — QA audit wrap-up

Generated: 2026-09-10T17:10:47.615Z

## Summary

- Transactions recorded: **174**
- Cases: **113** (pass 111 / fail 2)
- Each transaction and pass/fail row includes PoX cycle, burn block, and cycle burn window.

## Suite results

| Suite | Pass | Fail |
| --- | ---: | ---: |
| activation | 2 | 0 |
| admin | 10 | 1 |
| deploy | 9 | 0 |
| init | 12 | 0 |
| sponsor-platform | 5 | 0 |
| events | 15 | 0 |
| start | 6 | 0 |
| pot-sponsor | 8 | 0 |
| join | 24 | 0 |
| cancel | 1 | 0 |
| claim | 9 | 0 |
| mixed-funds | 2 | 0 |
| cross-contract | 3 | 0 |
| contract-matrix | 5 | 1 |

## Contract results

| Contract | Pass | Fail |
| --- | ---: | ---: |
| sim-pox-5 | 1 | 0 |
| fastpool | 1 | 0 |
| init-admin | 2 | 2 |
| stackspots | 14 | 0 |
| qa-bad-deps | 1 | 0 |
| qa-bad-preinit | 1 | 0 |
| pot-a | 42 | 0 |
| pot-b | 25 | 0 |
| pot-c | 10 | 0 |
| jackpot | 2 | 0 |
| stackspot-sponsor | 8 | 0 |
| sbtc-token | 1 | 0 |
| harness | 1 | 0 |
| sequential | 1 | 0 |
| crowd-fund | 1 | 0 |

## Failed cases

| ID | Title | Expected | Actual | Notes |
| --- | --- | --- | --- | --- |
| ADM-01 | init-admin after genesis top-level activation (should already be initialized) | err u1413 | ok | spec: deploy-time (update-contract-hash) must set initialized |
| CTR-init-admin | init-admin battery | 0 failed cases | 2/3 passed | ADM-01 |

## Auditor notes

- Pre-test snapshot at cycle=0 burn=3 (burns 0–2099) stacks=3. PoX cycle length is 2100 burn blocks.
- Mixed funds after claim: pot STX before 8000000, sponsor STX delta 3000000, participant STX delta 8000000, pot sBTC before 0 after 0.
- Sequential pot-b: 7 claim rounds after start (6 winner payouts then leftover Fastpool yield). Chain at cycle=8 burn=17233 (burns 16800–18899) stacks=17407.
- sponsor-platform transfers STX into stackspot-sponsor then calls sim-pox-5.stake as tx-sender (not as-contract), so lock uses the caller wallet rather than the contract's received STX.
- init-admin: genesis top-level (update-contract-hash) allowlists hashes, but a later admin public call still succeeds — `initialized` does not block the first public invocation in this simnet (ADM-01).
- Chain coverage: PoX cycle 0 burn 3 (burns 0–2099) → cycle 8 burn 17233 (burns 16800–18899). Cycle length is 2100 burn blocks. Jackpot/crowd-fund stake 1 cycle; sequential pot-b stakes 6 cycles with 7 claim rounds; platform sponsor stakes 10 cycles.

## Artifacts

- `reports/qa-function-map.md`
- `reports/qa-roles.md`
- `reports/qa-pre-test-snapshot.json`
- `reports/qa-transaction-log.xlsx`
- `reports/qa-transaction-log.json`
- `reports/qa-balances.json`
- `reports/qa-balances.md`
- `reports/qa-pass-fail-matrix.md`
- `reports/qa-contract-matrix.md`
- `reports/qa-wrap-up.md`
