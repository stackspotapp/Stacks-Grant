# StacksPot Clarity Smart Contract Audit & Test Simulation

## One-Cycle Crowdfund Pot Lifecycle, Fastpool Integration, Sponsorship, Claiming, Cancellation, and Fund Accounting

**Scope:** `simnet-ai` crowd-fund pot only. Contracts were **not** modified for this audit.  
**Environment:** Clarinet / Simnet (`npx vitest run tests/one-cycle-lifecycle.test.ts`).  
**Evidence:** `simnet-ai/reports/one-cycle-audit-run.json` (calls, burns, findings, balance snapshots).  
**Harness:** `simnet-ai/tests/one-cycle-lifecycle.test.ts` (11 tests, all executed; last run **11 passed** as a capture suite — several *scenario outcomes* still **fail** the audit criteria).  
**Fastpool:** Simnet `sim-pox-5` + `fastpool` + weekly sBTC payout mining. **Not** live Fastpool / mainnet.

---

### Identity mapping (prompt aliases vs Clarinet accounts)

The prompt’s `wallet_1` is **not** Clarinet `wallet_1`. Platform ownership is the **deployer**.

| Prompt alias | Role | Simnet principal |
|---|---|---|
| `wallet_1` (platform) | Core platform / `stackspots` deployer | `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM` (**Clarinet `deployer`**) |
| Clarinet `wallet_1` | Unused EOA in this harness | `ST1SJ3DTE5DN7X54YDH5D64R3BCB6A4T` |
| `wallet_2` | Pot deployer / activator / funding recipient | `ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG` |
| `wallet_3` | Participant 1 — 100 STX | `ST2JHG361ZQSSRS7EJ0MVTKG6T2VF8K2K` |
| `wallet_4` | Participant 2 — 200 STX | `ST2NEB94G7XHW8G8NHQFQBM6G26M3AG2` |
| `wallet_5` | Participant 3 — 300 STX | `ST2REHHS5J3CERCRBEPMGH7921Q6PYKAFT` |
| `wallet_6` | External STX sponsor — 1,000 STX | `ST3AM1AR4S6C3FYS7MHHQ5S2MNCZTHN2` |
| `wallet_7` | Fastpool liquidity — 1,000,000 STX | `ST3PF13W7Z0RRM42N9EW9ZSMWEH34AMN` |
| `wallet_8` | Unauthorized / permissionless claimer | Clarinet `wallet_8` |

Each scenario deploys a **fresh** pot copy from `wallet_2` (`cf-s1` … `cf-s6`). Genesis `.crowd-fund` is not reused.

**Authorization note:** `pot_admin` is `tx-sender` at deploy (`wallet_2`). Platform admin functions use `stackspots` / `init-admin` with the **deployer**. Cross-contract calls use `contract-caller` (the pot), not `tx-sender`.

---

## Deliverable A — Contract dependency map

### Contracts exercised

| Contract | Role |
|---|---|
| `crowd-fund.clar` (copies `wallet_2.cf-s*`) | Pot lifecycle |
| `stackspots.clar` | Hash allowlist, `register-pot`, event logs, treasury, fee |
| `init-admin.clar` | Post-boot `update-contract-hash` (plan still runs before sponsor) |
| `stackspot-sponsor.clar` | Optional platform-sponsor NFT / `sponsor-event` / `claim-sponsor-reward` |
| `sim-pox-5.clar` | Stake / unstake / reward cycle / unlock |
| `fastpool.clar` | Delegation target, crystallize, `settle-staker-rewards`, `payout` |
| `sbtc-token.clar` | Yield token |
| `stackspot-vrf.clar` | `generate-list` for staked-cycle indices |
| `stackspot-pots-trait` / `stackspot-sponsor-trait` | Traits |

### Public entry points (one-cycle path)

| Function | Caller | Cross-contract | State written | Assets | Auth / preconditions | Transition | Observed result |
|---|---|---|---|---|---|---|---|
| Deploy (source-body `log-pre-init`) | `wallet_2` | `stackspots.log-pre-init` | none yet | none | hash must exist | published anyway | **err u1110**, contract still exists |
| `stackspots.set-pot-contract-hash` | deployer | — | allowlist | — | admin | hash true | **ok** |
| `init-pot` no PS list | `wallet_2` | `stackspots.register-pot` | name, cycle=1, min, max=3, funding, `initiated` | 0.1 STX fee to `stackspots` | `tx-sender == pot_admin` | initialized | **ok** |
| `init-pot` with `.stackspot-sponsor` | `wallet_2` | `sponsor-event` then `register-pot` | payload `sponsors` = list of **responses** | — | same | **blocked** | **err u1202** (`stackspots` decode) |
| `join-pot` | wallets 3–5 | STX transfer to pot | participant maps | 100/200/300 STX | min, not locked, unique | funded | **ok** |
| `join-pot-as-sponsor` | `wallet_6` | STX to pot | sponsor maps, `sponsor-amount` | 1,000 STX | unique, min | funded | **ok** |
| `start-pot` | `wallet_2` | `sim-pox-5.stake .fastpool` | `locked`, starter, `staked-cycles`, `lock-burn-height` | 1,600 STX staked from pot | target met, not cancelled | started | **ok** |
| `claim-pot-reward` empty list | any `tx-sender` | Fastpool pull, sBTC split, STX refunds, `log-claim-pot-reward` | `pot-session-ended`, claimer, winner | STX principal + sBTC yield | `can-claim-pot` (burn > reward-release), not cancelled, **yield > 0** | claimed | **ok** (S1 first / S2 after failed cancel / S6 empty) |
| `claim-pot-reward` with PS list | any | `claim-one-platform-sponsor` map unwrap | — | — | ticket map must exist | **blocked** | **err u1001** |
| Second `claim-pot-reward` | any | let binds `(- stx-balance sponsor-amount)` | — | — | after first claim STX is 0, `sponsor-amount` still 1,000 STX | **runtime panic** | **ArithmeticUnderflow** |
| `cancel-pot` before time gate | any (no owner check before gate) | — | none | none | `burn > first-join + 2150 * cycles` | rejected | **err u1408** |
| `cancel-pot` after unlock | any | `sim-pox-5.unstake` | none (tx fails) | none | locked → unstake required | rejected | **err u27** `ERR_NOT_STAKING` |

### Cycle model (verified, not assumed)

- `CYCLE_LENGTH` in harness = **2100** (mainnet-shaped PoX-5).
- `more_than_one_cycle` = prepare (50) + reward-cycle (2100) = **2150**.
- Claim eligibility: `can-claim-pot` requires `burn-block-height > reward-release` (`unlock + 432`).
- Observed claim/cancel-at-end burn: **4633** (consistent with stake in cycle 0, 1-cycle unlock 4200, release 4632).
- Cancel time gate uses **first join height + 2150 × pot-cycle**, **not** `reward-release`. Mid-cycle (burn 1054) is still **u1408**.
- Yield pull: `pull-staking-rewards-cycle` → crystallize Fastpool → `settle-staker-rewards` → `payout`. Soft-fail Fastpool `u1001` as no claimable for that cycle helper; **unrelated** to pot `err_not_found u1001` on missing sponsor-ticket map.

`wallet_7` 1,000,000 STX sits on **`.fastpool`**, not on the pot. Pot principal is **1,600 STX** (600 + 1,000).

---

## Deliverable B — Six-scenario execution matrix

Platform-sponsor columns: **intended** vs **actual**. S4–S6 could not initialize with platform sponsor; tests continued on empty-sponsor fallback so funding/start still executed.

| ID | Init | Join 100/200/300 | Ext. sponsor 1,000 | Platform sponsor | Start | Cycle cfg | Cycle complete (burn 4633 / `can-claim`) | Terminal | Principal | Sponsor STX | Yield | Final state | Audit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **S1** no PS, claim | ok | ok | ok | none (ok) | ok | `pot-cycle=1`, staked cycle recorded | yes | **First claim ok** (`wallet_8`). Repeat **runtime underflow** | Refunded (p1/p2/p3 back to 100e12) | Refunded | 13,589 sats pulled; split executed | pot STX=0 sBTC=0; `session-ended`; 2nd claim panics | **FAIL** (replay unsafe) |
| **S2** no PS, cancel at end | ok | ok | ok | none | ok | 1 cycle | yes | **cancel err u27**; 2nd cancel u27; **claim-after-cancel ok** | Still 1,600 on pot after cancel fail; claim path can refund | same | Fastpool held ~17e6 sats until claim | Cancel never terminal; claim can still run | **FAIL** (cancel) |
| **S3** no PS, cancel early | ok | ok | ok | none | ok | 1 cycle | **no** (burn 3 and 1054) | all cancel **u1408** | 1,600 remains on pot | remains | not pulled | still started/locked | **FAIL** vs “early cancel”; **PASS** if time-gate is intended |
| **S4** with PS, cancel at end | **u1202** then fallback no-PS ok | ok | ok | **not configured** | ok | 1 cycle | yes | cancel **u27** | 1,600 still on pot | still on pot | not pulled at cancel | same as S2 cancel | **FAIL** |
| **S5** with PS, cancel early | **u1202** then fallback | ok | ok | **not configured** | ok | 1 cycle | no | cancel **u1408** | 1,600 on pot | on pot | — | started | **FAIL** (PS + early cancel) |
| **S6** with PS, claim | **u1202** then fallback | ok | ok | **not configured** | ok | 1 cycle | yes | claim+PS list **u1001**; empty list **ok** | Refunded | Refunded | 13,589 sats; closer=`wallet_2` | pot 0/0 | **PARTIAL** (claim works only without PS list) |

---

## Deliverable C — Detailed execution logs (ordered)

Full rows are in `simnet-ai/reports/one-cycle-audit-run.json`. Condensed:

### Boot (each isolated `it`)

1. `init-admin.update-contract-hash` → **ok** (allowlist after plan-order chicken-egg).
2. Activate PoX/Fastpool stack.
3. `wallet_7` `transferSTX` 1,000,000 STX → `.fastpool` → **ok**.
4. `fundAndStakeFastpoolThreshold` (protocol helper, separate from pot principal).
5. Join window helper.

### Scenario 1 (`wallet_2.cf-s1`)

| Step | Caller | Result | Burn |
|---|---|---|---|
| deploy | wallet_2 | err u1110 | 3 |
| allow-hash | deployer | ok | 3 |
| init-pot `[]` sponsors | wallet_2 | ok | 3 |
| join 100/200/300 | 3/4/5 | ok | 3 |
| join-pot-as-sponsor 1000 | wallet_6 | ok | 3 |
| start-pot | wallet_2 | ok | 3 |
| mine to `reward-release` | — | burn **4633** | 4633 |
| claim-pot-reward `[]` | **wallet_8** | **ok** | 4633 |
| claim-pot-reward `[]` | wallet_2 | **runtime ArithmeticUnderflow** | 4633 |
| claim again | wallet_2 | **same panic** | 4633 |

### Scenario 2 (`cf-s2`)

Same create/fund/start/mine. `cancel-pot` @ 4633 → **err u27**. Repeat cancel u27. `claim-pot-reward []` → **ok**.

### Scenario 3 (`cf-s3`)

Same through start. `cancel-pot` immediately → **u1408**. Unauthorized extra also **u1408** (time gate first). Mine to burn **1054**. Mid cancel **u1408**.

### Scenario 4 (`cf-s4`)

`init-pot` with `(list .stackspot-sponsor)` → **u1202**. Fallback empty init **ok**. Fund/start/mine. `cancel-pot` @ 4633 → **u27**.

### Scenario 5 (`cf-s5`)

Same PS init **u1202**, fallback, start. Immediate cancel **u1408**.

### Scenario 6 (`cf-s6`)

PS init **u1202**, fallback, fund, start, mine. Claim with PS list → **u1001**. Claim `[]` → **ok**.

### Extra cases

| Case | Result |
|---|---|
| A unauth init | **u1102** |
| A duplicate init | **u1409** |
| B join 0 / below min | **u1301** |
| B duplicate join | **u1201** |
| B sponsor 0 | **u1301** |
| B duplicate sponsor | **u1202** (pot `err_duplicate_sponsor`) |
| C start uninitialized | **u1001** (`record-staked-cycles` / `generate-list`) |
| C claim before release | **u1402** |
| D cancel before start | **u1408** |

---

## Deliverable D — Financial reconciliation

Units: microSTX and sBTC sats. Genesis EOA STX ≈ `100_000_000_000_000` (1e14). One STX = 1e6 microSTX.

### Accounting baseline (all funded scenarios)

| Source | Amount |
|---|---:|
| wallet_3 | 100 STX |
| wallet_4 | 200 STX |
| wallet_5 | 300 STX |
| wallet_6 external sponsor | 1,000 STX |
| **Pot committed** | **1,600 STX** |
| wallet_7 Fastpool LP | 1,000,000 STX (**not** pot principal) |
| `stackspots` register fee | 0.1 STX (`fee` = u100000) |

### S1 post-first-claim (executed)

| Holder | STX | sBTC |
|---|---:|---:|
| pot `cf-s1` | 0 | 0 |
| p1, p2, p3, sponsor | genesis restored (principal returned) | 0 |
| extra (`wallet_8` closer) | genesis | **271** |
| potDeployer (admin + starter + funding winner) | genesis − 0.1 STX fee | **13,183** |
| `stackspots` | 100,000 | **135** |
| `.fastpool` | 1,000,000 STX | 16,986,409 (pool remainder) |

Yield pulled onto pot then fully disbursed: **13,589 sats**.

Crowdfund formula (`dispatch-rewards`):

- 1% platform → `platform_address` (`stackspots` treasury): `13589 / 100 = 135`
- 5% pot admin (`wallet_2`): `679`
- 2% starter (`wallet_2`): `271`
- 2% claimer (`wallet_8`): `271`
- remainder to `funding-address` (`wallet_2`, `decide-winner`): `13,589 − 135 − 679 − 271 − 271 = 12,233`
- Sum to `wallet_2`: `679 + 271 + 12,233 = 13,183` — **matches snapshot**.

**Jackpot 90/5/2/2/1 was not applied.** Crowdfund winner is the **funding address**, not a random participant. Participants receive **principal only**.

### S6 post empty-list claim

Same 13,589 sats. Closer = `wallet_2`, so deployer sBTC **13,454** = 679+271+271+12,233; platform **135**; extra **0**. Pot 0/0. Principal restored.

### S2 / S3 / S4 after failed cancel

Pot still **1,600 STX**, sBTC 0. Participants still down 100/200/300/1000 STX. Fastpool LP 1,000,000 STX unchanged. After S2’s subsequent claim, principal/yield follow the S6-style path (claim succeeded; no extra post-claim snap for S2).

### Yield isolation

`claim-pot-reward` sets `pot-yield` to **`sbtc-token.get-balance(current-contract)`**, then `dispatch-rewards` spends that **entire balance**. Attribution is “whatever sBTC sits on this pot,” not a stored `earned` integer. Isolated copies cannot sweep another pot’s sBTC. A leftover on the **same** contract (platform-sponsor payout, failed prior dispatch) **would** be treated as yield.

Principal is never added into the sBTC split. STX refunds use `total-balance − sponsor-amount` (unsafe after first claim — see OC-02).

### Unexplained

None on the successful first-claim path: 13,589 in = 135+679+271+271+12,233 out.

---

## Deliverable E — Findings report

Ranked. **Confirmed by execution** unless noted.

### OC-01 — Critical — Cancel after cycle end cannot unstake

**Affected:** S2, S4 (and S6 cancel-equivalent).  
**Type:** Execution blocker / fund-locking risk.  
**Contract:** `crowd-fund.clar` `cancel-pot` ~726–739; `sim-pox-5.clar` `ERR_NOT_STAKING` u27.  
**Trace:** Start 1 cycle → mine past unlock/reward-release (burn 4633) → `cancel-pot`.  
**Observed:** **err u27**. Pot still holds 1,600 STX. Repeat cancel same.  
**Expected:** Either unstake is a no-op after auto-unlock and refunds proceed, or cancel is explicitly forbidden and a **non-yield-gated** reclaim exists.  
**Root cause:** After PoX unlock, `get-staker-info` is none; `unstake` unwraps **u27**. `if (var-get locked)` still attempts unstake.  
**Impact:** Documented cancel-at-end **does not work**. Combined with OC-06 (cannot cancel early) and yield gate `asserts! (> pot-yield u0)` (`err u1302`), **zero-yield** end-of-cycle can leave principal **unrefundable** via both cancel and claim. Zero-yield cancel+claim combo was **not** executed this run (positive yield was always present); claim-with-zero is code-confirmed.  
**Fix:** If unlocked, skip unstake; refund STX; set `pot-cancelled`. Do not require sBTC > 0 to return principal.  
**Regression:** S2 already fails cancel; add a zero-yield claim/cancel pair.  
**Confidence:** Cancel u27 **confirmed**. Combined lock **likely**.

### OC-02 — Critical — Second claim panics (ArithmeticUnderflow)

**Affected:** S1.  
**Type:** Lifecycle inconsistency / unsafe replay.  
**Contract:** `claim-pot-reward` let bindings ~621–623: `(- total-balance total-sponsor-amount)` **always evaluated**.  
**Trace:** Permissionless first claim succeeds (STX refunded, `sponsor-amount` still 1,000 STX, pot STX 0) → second `claim-pot-reward`.  
**Observed:** Simnet **runtime ArithmeticUnderflow** (`native_sub`), not `err`.  
**Expected:** `err_pot_cancelled` / session-ended / insufficient yield, **atomic fail**.  
**Root cause:** Let subtraction underflows before `pot-session-ended` branch. Session-ended path still intends a second sBTC dispatch.  
**Impact:** Replay is not a clean reject; clients see a crash. Residual with-stx / accounting is unsafe.  
**Fix:** Guard session-ended first; use saturating/checked sub; clear `sponsor-amount` after refund; do not re-enter STX math.  
**Regression:** S1 second claim.  
**Confidence:** **Confirmed**.

### OC-03 — High — Platform-sponsor init cannot register

**Affected:** S4, S5, S6.  
**Type:** Integration mismatch / execution blocker.  
**Contracts:** `crowd-fund.init-pot` encodes `sponsors: sponsor-tickets` (list of **responses** from `register-to-platform-sponsor`); `stackspots.register-pot` decodes `sponsors: (list 5 {sponsor-contract: principal, ticket-id: uint})` → `ERR_INVALID_ARGUMENT_VALUE` **u1202**.  
**Observed:** init-with-platform-sponsor **err u1202**. Empty list init **ok**.  
**Impact:** Mandatory “with platform sponsor” scenarios **cannot be executed**. Fallback is a different pot.  
**Fix:** Encode the tuple shape `register-pot` expects, or decode responses. Keep `from-consensus-buff?` in lockstep.  
**Confidence:** **Confirmed** (execution + decode inspection).

### OC-04 — High — Claim with platform-sponsor list fails even after fallback

**Affected:** S6.  
**Type:** Execution blocker.  
**Contract:** `claim-one-platform-sponsor` ~308–310 `unwrap! (map-get? platform-sponsor-tickets …) err_not_found` (**u1001**).  
**Observed:** claim with `(list .stackspot-sponsor)` → **err u1001**; empty list **ok**.  
**Impact:** Passing a sponsor trait at claim **blocks** an otherwise valid claim. Callers must know to pass `[]` if init never wrote tickets.  
**Fix:** Skip missing map entries; do not reuse Fastpool’s u1001.  
**Confidence:** **Confirmed**.

### OC-05 — High — Claim (and cancel after time gate) are permissionless

**Affected:** S1 (`wallet_8` claimed and received **2%** closer). Cancel has **no** `pot_admin` check (only contract principal + time gate).  
**Type:** Authorization / economic.  
**Observed:** First S1 claim by extra wallet **ok**, 271 sats.  
**Expected (prompt):** authorized closer. Implementation pays **any** `tx-sender` 2%.  
**Impact:** Front-runnable closer share. Cancel after gate is similarly open (once unstake is fixed).  
**Fix:** Restrict claim/cancel to admin/starter or accept and document MEV.  
**Confidence:** **Confirmed**.

### OC-06 — Medium — Early / mid / pre-start cancel always u1408

**Affected:** S3, S5, D.  
**Type:** Lifecycle.  
**Contract:** `cancel-pot` ~732 `err_too_early`. Gate = `first-user-joined + 2150 * pot-cycle`, independent of `locked` / unlock.  
**Observed:** burn 3 and 1054 → **u1408**; balances unchanged (atomic).  
**Expected:** Prompt requires testing early cancel; implementation **forbids** it until ~one full prepare+cycle after first join. At true cycle-end (4633) the gate **passes**, then OC-01 fires.  
**Impact:** No unwind of Fastpool stake until late; then unstake is broken.  
**Confidence:** **Confirmed**.

### OC-07 — Medium — Zero sBTC blocks principal return on claim

**Affected:** claim path (code); not hit in S1/S6 because yield was 13,589.  
**Type:** Fund-locking.  
**Contract:** `asserts! (> pot-yield u0) err_insufficient_pot_reward` **before** STX refunds.  
**Impact:** With OC-01, zero-yield terminal pots have **no** working exit.  
**Confidence:** **Code inspection** (positive-yield claims succeeded).

### OC-08 — Low — Deploy `log-pre-init` err u1110

**Affected:** every deploy.  
**Type:** Integration mismatch.  
**Contract:** trailing `log-pre-init PRE_INIT_LOG` (~872); `stackspots` likely rejects unallowlisted / uninitiated hash. Clarinet still **publishes** the contract.  
**Impact:** Deploy result is not `ok`; operators may abort; copies still work after `set-pot-contract-hash`.  
**Confidence:** **Confirmed**.

### OC-09 — Informational — Entire pot sBTC balance treated as yield

See Deliverable D. Isolated copies were safe. Shared-contract leftover would be swept.  
**Confidence:** **Code + S1/S6 balances**.

### OC-10 — Informational — Simnet Fastpool ≠ live Fastpool

Rewards came from the **simnet weekly payout miner** during `mineUntilBurnHeight`. Do not treat 13,589 sats as a mainnet APR proof.

### Not findings (worked as coded)

- Empty-sponsor init, joins, duplicate join/sponsor, min-amount, admin-only init, duplicate init, claim before `reward-release` (u1402), 1-cycle start, principal+sponsor refunds on **first successful claim**, 1/5/2/2/rest sBTC split, Fastpool LP kept separate from pot STX.

---

## Deliverable F — Regression test suite

**Runnable:** `cd simnet-ai && npx vitest run tests/one-cycle-lifecycle.test.ts --pool=threads --maxWorkers=1`

The suite is an **audit recorder**: it asserts init/fund/start where those must succeed, and **records** cancel/claim/PS failures instead of hiding them. Last run: **11 passed** (harness), with findings list capturing S1 underflow, S2/S4 u27, S3/S5 u1408, S4–S6 u1202, S6 claim u1001.

Assertions already present:

- Isolated pot STX == 1,600,000,000 after funding.
- Init ok without platform sponsor; duplicate init u1409; unauth init u1102.
- Claim before release u1402 (C).
- Snapshots of STX/sBTC for S1/S2/S3/S4/S6.

Add after fixes (do not change contracts in this audit):

1. S1 second claim returns a Clarity `err`, never underflow; balances unchanged.
2. S2/S4 `cancel-pot` at burn > max(unlock, time-gate) **ok** and refunds 100/200/300/1000 STX exactly once; later claim **u1404**.
3. S4/S6 `init-pot` with `.stackspot-sponsor` **ok** and ticket map populated.
4. S6 claim with that list **ok** or skips missing tickets without blocking STX refund.
5. Zero-yield claim still refunds STX.
6. Unauthorized claim: either reject or document closer share.

---

## Deliverable G — Remediation plan

Do **not** apply these until explicitly requested. Smallest safe fixes:

| ID | Change | Cross-contract | Tests |
|---|---|---|---|
| OC-01 | In `cancel-pot`, treat `unstake` u27 / missing staker as already unlocked; then refund | maybe none | S2, S4 |
| OC-02 | Assert `pot-session-ended` / cancelled first; never subtract `sponsor-amount` from 0 STX | none | S1 replay |
| OC-03 | Align init payload `sponsors` with `register-pot` tuple type | `stackspots` + pot | S4–S6 init |
| OC-04 | `match` ticket map; empty list remains valid | sponsor contract optional | S6 |
| OC-05 | Auth or document | none | wallet_8 claim |
| OC-06 | Optional: allow admin cancel-before-start; keep in-cycle policy explicit | Fastpool unstake mid-lock may still fail | S3, D |
| OC-07 | Refund STX even if `pot-yield == 0`; skip sBTC dispatch | none | new zero-yield it |
| OC-08 | Allow pre-init log or remove deploy-time call | `stackspots.log-pre-init` | deploy result ok |

No mainnet transactions. No contract edits in this pass.

---

## State machine (derived)

```
deployed (log-pre-init may err)
  → initialized (init-pot, empty sponsors)
  → funded (joins + external sponsor)
  → started (start-pot, locked, staked-cycles)
       → claim eligible (burn > reward-release AND sBTC > 0)
            → claimed (session-ended; STX 0; second claim panics)
       → cancel before first-join+2150 → u1408 (no change)
       → cancel after unlock → u27 (no change; claim still possible)
```

Impossible / observed contradictions:

- **Cancelled and claimed:** cancel never set `pot-cancelled` at cycle end.
- **Started without cycles:** uninitialized start **u1001**.
- **Claimed without settlement:** not observed on first ok claim.
- **Registry vs pot:** register only on successful init; failed PS init does not mint.

`tx-sender` vs `contract-caller`: `register-pot` requires `contract-of contract == contract-caller` (the pot). `init-pot` requires `tx-sender == pot_admin`. Platform-sponsor `sponsor-event` requires `contract-caller == pot`.

---

## Acceptance checklist

1. Six isolated scenarios **attempted** — yes.  
2. One Fastpool cycle configuration — yes (`CYCLES = 1`, start ok).  
3. Cycle completion via `potRewardRelease` / burn **4633**, not a random block jump — yes.  
4. Participant principal reconciled on successful claim — yes (S1, S6).  
5. External sponsor reconciled on successful claim — yes.  
6. Platform sponsor enabled **and** disabled — disabled works; **enabled init fails (OC-03)**.  
7. Fastpool LP separate from pot — yes (1e12 vs 1.6e9).  
8. Reward source traced to Fastpool payout onto pot, then `get-balance` — yes.  
9. Claim/cancel permissions — claim **permissionless** (OC-05); cancel gated by time then broken unstake.  
10. Duplicate claim/cancel — cancel duplicate u27; claim duplicate **panic**.  
11. Failed ops atomic except **runtime underflow** (not a Clarity err).  
12. Blockers documented — yes.  
13. Regression harness exists; some defects are the recorded failures.  
14. Simnet vs live Fastpool distinguished — yes.

**Overall:** A one-cycle **claim with empty sponsor list and positive Fastpool yield succeeds** and conserves STX/sBTC. **Cancel at cycle end does not. Platform sponsor cannot be initialized. Replay claim crashes. Early cancel is rejected. Permissionless closer takes 2%.**
