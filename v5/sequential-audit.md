# `.sequential` QA — 2026-11-04 (crowd-fund shell + catch-up winners)

Simnet-ai. Sequential is a crowd-fund dump: `init-pot`, `join-pot`, `join-pot-as-sponsor`, `start-pot`, `claim-pot-reward`, `cancel-pot`. Winner payment is sequential catch-up: one recorded cycle per joiner; missed cycles share the winner slice on the next claim.

Recorder: **6 passed**, every `claim-pot-reward` **ok**. Fees (1% platform, 5% owner, 2% starter, 2% claimer) come out first; the rest splits across due unclaimed joiners. Claimer also receives the 2% closer cut, so a late round’s caller can hold slightly more than skipped winners.

## sBTC after first claim in each exec

| Exec | First claim clock | Omitted | w1 | w2 | w3 | w4 | w5 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | 2 | none | 77813 | 0 | 0 | 0 | 0 |
| E2 | 3 | 1 | 76120 | 79503 | 0 | 0 | 0 |
| E3 | 4 | 1–2 | 76120 | 76120 | 81194 | 0 | 0 |
| E4 | 5 | 1–3 | 76119 | 76119 | 76119 | 82885 | 0 |
| E5 | 6 | 1–4 | 76119 | 76119 | 76119 | 76119 | 84576 |

## Reproduction

```bash
cd v5/simnet-ai
npm test -- tests/sequential-claim-audit.test.ts
```
