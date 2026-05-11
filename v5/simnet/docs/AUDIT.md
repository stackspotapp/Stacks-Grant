# Clarity Audit — `stacks-grant/v5`

Structured security audit produced via the
[`clarity-audit`](https://github.com/aibtcdev/skills/tree/main/clarity-audit)
skill framework on the `chore/review-friedger` branch.

- **Audit performed:** 2026-05-06
- **Audited revision:** `6b1ebda` (start of session)
- **Status snapshot HEAD:** `111690a` (`chore: remove audited contract map`)

The findings below are the original audit output (severity, risk, location,
recommendation). The **Status (HEAD)** column tracks which findings have
since been addressed in the working tree. Status values:

- ✅ **Fixed** — code change resolves the finding.
- 🟡 **Partial** — partially mitigated; residual risk remains.
- ⚪ **Open** — unchanged from audit time.
- 🚫 **Obsolete** — code path or contract removed; finding no longer applies.
- 🧪 **Test-pinned** — finding still present, but a regression test now
  guards against its re-introduction or future fix.

## System verdict (audit time)

| Contract | Verdict | Risk | Critical | High | Medium | Low |
|---|---|---|---|---|---|---|
| stackspot-trait | PASS | LOW | 0 | 0 | 0 | 1 |
| stackspot-admin | CONDITIONAL_PASS | MEDIUM | 0 | 1 | 3 | 2 |
| stackspot-audited-contracts | PASS | LOW | 0 | 0 | 1 | 0 |
| stackspot-registry | PASS | LOW | 0 | 0 | 0 | 1 |
| stackspot-winners | PASS | LOW | 0 | 0 | 0 | 1 |
| stackspot-vrf | **CRITICAL_FAIL** | **CRITICAL** | **1** | 0 | 1 | 1 |
| stackspots | **FAIL** | **HIGH** | **1** | 2 | 4 | 2 |
| stackspot-distribute | **FAIL** | **HIGH** | 0 | **2** | 3 | 2 |
| stackspot-jackpot | **FAIL** | **HIGH** | **1** | 2 | 5 | 3 |
| stackspot-crowd-fund-pot | **FAIL** | **HIGH** | **2** | 1 | 4 | 2 |
| stackspot-sequencial-pot | **CRITICAL_FAIL** | **CRITICAL** | **3** | 1 | 3 | 2 |

**Audit-time verdict:** NOT READY FOR DEPLOYMENT. Funds at risk via VRF
manipulation, unguarded `mint`, and sequential-pot logic errors.

---

## 1. `stackspot-trait.clar`

| ID | Severity | Title | Status (HEAD) |
|---|---|---|---|
| 1.1 | low | ABI drift: trait declares `(string-ascii 255)` for `get-pot-name` / `get-pot-type` while deployed STXLFG advertises shorter widths. Length-shorter values are structurally compatible but signals divergence between deployed and v5 trait. | 🚫 won't fix |

---

## 2. `stackspot-admin.clar`

| ID | Severity | Title | Status (HEAD) |
|---|---|---|---|
| 2.1 | high | Hash whitelist is one-shot — `add-pot-contract-hash` used `map-insert` so the `state` flag could never be flipped after first call. | ✅ **Fixed.** Renamed to `set-pot-contract-hash`, body now uses `map-set`; revocation path covered by `tests/stackspot-admin.test.ts` ("re-setting … with state=false revokes it"). |
| 2.2 | medium | Hardcoded testnet bootstrap admin: deploy-time `(add-update-admin-status 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5 true)` would either fail address parsing or grant admin to a stale principal on mainnet. | ⚪ Open — line 91 still hardcoded. |
| 2.3 | medium | PRIMARY_ADMIN single point of failure — only the deploy-time tx-sender can grant/revoke admins; lost key freezes the admin set. No transfer/multisig. | fixed. |
| 2.4 | medium | `is-admin` / `can-deploy-pot` use `tx-sender` — phishing-via-traits risk where downstream contracts compose on the check. | fixed. |
| 2.5 | low | `is-contract-allowed-hash` returns `(optional bool)` — `(some false)` and `none` are different, callers rely on `default-to false`. | fixed |

---

## 3. `stackspot-audited-contracts.clar`

| ID | Severity | Title | Status (HEAD) |
|---|---|---|---|
| 3.1 | medium | Audit toggle is keyed on raw principal but mutated only via trait reference; an existing on-chain pot that drops trait conformance can never be unmarked. | 🚫 **Obsolete.** Contract removed in commit `111690a` (`chore: remove audited contract map`). All references in `stackspots` / `stackspot-distribute` were dropped at the same time. |

---

## 4. `stackspot-registry.clar`

| ID | Severity | Title | Status (HEAD) |
|---|---|---|---|
| 4.1 | low | `define-read-only` with side-effecting `print` — idiomatic but obscures intent. Caller restricted to `.stackspots`. | 🚫 won't fix. |

## 5. `stackspot-winners.clar`

| ID | Severity | Title | Status (HEAD) |
|---|---|---|---|
| 5.1 | low | Same shape as `stackspot-registry.clar` — read-only event sink restricted to `.stackspot-distribute`. | 🚫 won't fix. |

---

## 6. `stackspot-vrf.clar` — **CRITICAL_FAIL**

| ID | Severity | Title | Status (HEAD) |
|---|---|---|---|
| 6.1 | **critical** | VRF is fully predictable — entropy = `sha256(header-hash(height-1) ‖ consensus-buff(tx-sender))`. Both inputs are public/caller-chosen at call time, so a participant can compute the random index off-chain, decide whether to send the `claim-pot-reward` tx, and effectively pick a favourable winner. They additionally collect the 2% claimer-reward. | ⚪ Open. `to-consensus-buff? tx-sender` is still mixed in; no commit-reveal step has been added. |
| 6.2 | medium | `LIST_UINT` capped at 100 — `generate-list start length` (parameter is actually end-exclusive) silently returns `none` past the cap. Currently OK because `pot-max-participants ≤ 100`, but a bigger pot would silently break. | 🧪 Test-pinned in `tests/stackspot-vrf.test.ts` ("returns none when start+length exceeds 100"). |
| 6.3 | low | `lower-16-le` naming misleading — slices bytes 16..32 (high half), label says "lower". | fixed |

---

## 7. `stackspots.clar` — **FAIL**

| ID | Severity | Title | Status (HEAD) |
|---|---|---|---|
| 7.1 | **critical** | `mint` was `define-public` with no caller restriction beyond "tx-sender ≠ platform-treasury". Any external caller could spam-mint pot NFTs to arbitrary contract addresses, polluting the registry and pre-occupying a real pot's index slot. | ✅ **Fixed.** `mint` is now `define-private` (line 190); only reachable through `register-pot`. |
| 7.2 | high | `register-pot` re-read `last-pot-index` after `mint` for event/log payloads — fragile if mint short-circuits or is moved. | ✅ **Fixed.** Now captures `mint`'s returned id explicitly: `(let ((pot-id (unwrap! (mint contract-address) ERR_MINT_FAILED))) …)`. |
| 7.3 | high | `delegate-treasury` accepts arbitrary `delegate-to` from the pot — needs verification that the downstream pool routes via memo, not free-form recipient. | ⚪ Open. `delegate-to` still forwarded as-is; downstream `sim-pox-4-multi-pool-v1.delegate-stx` sets a `{c: "sbtc"}` memo. |
| 7.4 | medium | `transfer` had unreachable `nft-transfer?` after `(asserts! false …)` — dead code that future refactors could expose. | ✅ **Fixed.** Body simplified to `ERR_NOT_PERMITTED`. |
| 7.5 | medium | `register-pot` fee balance check used strict `>` — owner with exactly `fee` STX was rejected. | ✅ **Fixed.** Now `(>= new-pot-owner-balance platform-contracts-fee)`. |
| 7.6 | medium | `platform-treasury` is a deploy-time constant — single-key admin, no transfer mechanism. | ⚪ Open. |
| 7.7 | medium | `(update-fee u100000)` ran at deploy as a redundant initialization echoing the data-var literal. | ✅ **Fixed.** Deploy-time call removed. |
| 7.8 | low | `get-token-uri` returns `(ok none)` — TODO comment present; metadata uri should be set before mainnet. | won't fix |
| 7.9 | low | Typo `pot-detailes` in dispatch helpers. | fixed. |

---

## 8. `stackspot-distribute.clar` — **FAIL**

| ID | Severity | Title | Status (HEAD) |
|---|---|---|---|
| 8.1 | high | `validate-can-claim-pot` multiplies `reward-release` (an absolute burn-block height) by `pot-cycle`. For `pot-cycle = 1` it works coincidentally; for any multi-cycle pot the threshold is years in the future. | 🧪 Test-pinned in `tests/stackspot-distribute.test.ts` ("pot-cycle = 2 doubles the threshold"). Still present at line 47. |
| 8.2 | high | Reward math fully trusts pot-supplied addresses (`pot-starter-address`, `pot-claimer-address`, `winner-address` are all read through the trait). The audit-hash gate is the sole defense — defense-in-depth (cross-validate winner ∈ participants, claimer = tx-sender) is missing. | ⚪ Open. |
| 8.3 | medium | `(unwrap! (get winner-address (get winners-values pot-details)) ERR_NOT_FOUND)` uses a generic error — should be `ERR_WINNER_NOT_SET` or similar. | Fixed. |
| 8.4 | medium | `and (> X u0) (try! …)` short-circuit pattern on rewards is brittle and reverts the whole dispatch on a single transfer failure. | Won't fix. |
| 8.5 | medium | `delegate-treasury` references `sim-pox-4-multi-pool-v1` — testnet-only. Same applies to all 3 pots calling `sim-pox-4 allow-contract-caller` at deploy. | ⚪ Open. Mainnet routing not yet parameterized. |
| 8.6 | low | Memo encoding via `to-consensus-buff?` returns optional, treated as `(buff 32)` by the helper without an explicit `unwrap-panic`; for fixed strings this never trips, but obscure. | won't fix. |
| 8.7 | low | `PLATFORM_ADDRESS` is the deploy-time `tx-sender` — royalty recipient cannot be rotated without redeploy. | ⚪ Open. |

---

## 9. `stackspot-jackpot.clar` — **FAIL**

| ID | Severity | Title | Status (HEAD) |
|---|---|---|---|
| 9.1 | **critical** | Inherits VRF predictability from `stackspot-vrf` (see 6.1). Caller can pick the winner index by choosing whether/when to submit `claim-pot-reward`. | ⚪ Open (parent issue). |
| 9.2 | high | Off-by-one in `MAX_PARTICIPANTS` guard — `(<= index-participants max-participants)` allows the (max+1)-th joiner. | ⚪ Partial. The 101st slot would be invisible to `get-pot-participants` because `LIST_UINT` is 0..99. Test-todo recorded in `tests/pots.test.ts`. |
| 9.3 | high | `validate-can-join-pot` semantics inverted — function name advertised "can join" but body returned `(var-get locked)`. | ✅ **Fixed.** Body is now `(not (var-get locked))`. Test pin in `tests/pots.test.ts` ("6a. validate-can-join-pot returns the correct boolean"). |
| 9.4 | medium | `claim-pot-reward` recomputed `pot-deploy-fee` / starter / claimer / winners rewards locally, even though `stackspot-distribute.dispatch-rewards` is the actual paymaster. Print event values can disagree with what was actually transferred. | 🟡 Partial. Local computation slimmed (no `pot-deploy-fee`, no `winners-reward`); `pot-starter-reward` and `claimer-reward` still recomputed locally for the print event only. |
| 9.5 | medium | `cancel-pot` is unreachable for empty pots — with no participants, `first-user-joined = none`, so the time gate `(> burn-block-height (+ burn-block-height MORE_THAN_ONE_CYCLE))` is always false. | won't fix. |
| 9.6 | medium | `claim-pot-reward` lacks an explicit `claimed: bool` flag; double-call is gated only by economics (treasury draining to zero). | ⚪ Open. |
| 9.7 | medium | `winners-values.winner-id` cosmetic — matches map key. | ⚪ Open (informational). |
| 9.8 | medium | Deploy-time `register-pot` may revert and "brick" the pot — runbook concern. | 🚫 **Obsolete for jackpot.** `init-pot` is now a `define-public` admin-only function called explicitly post-deploy (returns the `register-pot` result). Sequencial / crowd-fund still init at deploy time. |
| 9.9 | medium | `claim-pot-reward` eagerly evaluates `(get-random-index total-participants)` inside its `let`, BEFORE `validate-can-claim-pot`. With zero participants this panics with `DivisionByZero` (`mod _ u0`) instead of returning `ERR_POT_CLAIM_NOT_REACHED`. | 🧪 **New finding (discovered while writing tests).** Pinned in `tests/stackspot-jackpot.test.ts` ("with zero participants, panics on `(mod _ u0)`"). |
| 9.10 | low | `POT_ADMIN := tx-sender` — single-admin convention with no transfer. | ⚪ Open. |
| 9.11 | low | Hyphen typo `sim-pox4-multi-pool-v1` in deploy-time `allow-contract-caller` call (vs configured `sim-pox-4-multi-pool-v1`). Same in sequencial / crowd-fund. | ⚪ Open. Lines 530 in jackpot, 451 in crowd-fund, 458 in sequencial. |
| 9.12 | low | Unused error constants (`ERR_PARTICIPANT_ONLY`, `ERR_INVALID_ADDRESS`, …). | 🟡 Partial. Set trimmed (e.g. `ERR_PARTICIPANT_ONLY`, `ERR_INVALID_ADDRESS`, `ERR_INVALID_POT`, `ERR_INSUFFICIENT_BALANCE`, `ERR_INSUFFICIENT_POT_BALANCE`, `ERR_DELEGATE_FAILED`, `ERR_DISPATCH_FAILED`, `LEAVE_POT_MEMO` are no longer present). |

---

## 10. `stackspot-crowd-fund-pot.clar` — **FAIL**

| ID | Severity | Title | Status (HEAD) |
|---|---|---|---|
| 10.1 | **critical** | Deployer is permanently the funded recipient — `funding-address` is set at deploy to `tx-sender` and `claim-pot-reward` hard-codes `(winner (var-get funding-address))`. No setter, no participant disclosure. | ⚪ Open. Rendezvous invariant `invariant-funding-address-not-platform-or-treasury` exists but in the default simnet returns `false` (because `funding-address = deployer = platform-treasury`). Pinned in `tests/stackspot-crowd-fund-pot.test.ts`. |
| 10.2 | **critical** | VRF unused — `get-random-index` is defined but `claim-pot-reward` never calls it. Pot is advertised as a stacking lottery but is a fixed-recipient grant. | ⚪ Open. Recommend either reframing the contract as a grant or reintroducing random selection. |
| 10.3 | high | Inherits `<=` off-by-one (9.2) and previously inherited `validate-can-join-pot` inversion (9.3). | 🟡 Partial. Inversion fixed; off-by-one still present. |
| 10.4 | medium | `platform-fee` constant captured at deploy but never used (read at line 56). | ⚪ Open. |
| 10.5 | medium | `init-pot` `(if (not initiated) … false)` followed unconditionally by `(var-set initiated true)` — guard is decorative because init is private + once-only at deploy. | ⚪ Open. |
| 10.6 | medium | `min-amount = u100` (uSTX) — demo value; STXLFG on-chain has min 21 STX. | ⚪ Open. |
| 10.7 | medium | Dead reward calculations in `claim-pot-reward` (same shape as 9.4). | ⚪ Open. |
| 10.8 | low | Title comment says `stackspot-jackpot` (file/title disagree). | ⚪ Open. |

---

## 11. `stackspot-sequencial-pot.clar` — **CRITICAL_FAIL**

| ID | Severity | Title | Status (HEAD) |
|---|---|---|---|
| 11.1 | **critical** | Sequential payouts skip participant id 0 — `next-payment-id` initialised at u1, payouts iterate `1..N`, but the participants map is keyed `0..N-1`. Combined with the loop terminator `(is-eq next-payment-id total-participants)`, participant 0 receives only the principal refund, never a per-cycle reward. | ⚪ Open. Lines 55, 417, 424, 439. |
| 11.2 | **critical** | Each claim drains 90% of the CURRENT sBTC balance, not 1/N. `stackspot-distribute.dispatch-rewards` always sends `pot-yield - fees` to the winner. After the first sequential claim the treasury is empty, so subsequent cycles fail with `ERR_INSUFFICIENT_POT_REWARD`. A 100-participant sequential pot pays exactly one winner. | ⚪ Open. |
| 11.3 | **critical** | `validate-can-claim-pot` uses `next-payment-id` as a multiplier (line 94) — same shape as 8.1 but worse: each successful claim doubles, then triples, the threshold. | 🧪 Test-pinned in `tests/pots.test.ts` (todo) and `tests/stackspot-distribute.test.ts`. |
| 11.4 | high | Same `<=` off-by-one and previously the inverted `validate-can-join-pot` (now fixed). | 🟡 Partial (off-by-one open). |
| 11.5 | medium | `(define-data-var pot-cycle uint (var-get last-participant))` initialises pot-cycle from a data-var read at deploy. With `last-participant=0`, pot-cycle starts at 0 before `init-pot` overwrites to u1 — order-of-evaluation oddity. | ⚪ Open. |
| 11.6 | medium | `total-participants` snapshot at claim time — fine in practice (locked once started). | ⚪ Open (informational). |
| 11.7 | medium | Title comment says `stackspot-jackpot` (cosmetic copy-paste). | ⚪ Open. |
| 11.8 | low | Dead reward calculations / unused errors (same shape as 9.4 / 9.12). | 🟡 Partial. |
| 11.9 | low | `pot-name = "StackSpot Jackpot"` even though this is the sequential variant — misleading metadata. | ⚪ Open. |

---

## Cross-contract findings

| ID | Severity | Title | Status (HEAD) |
|---|---|---|---|
| X.1 | critical | Single-trust gate: `stackspot-distribute` trusts pot-supplied addresses (`winner-address`, `claimer-address`, `starter-address`, `pot-treasury`, `pot-yield`). Hash whitelist is the only defense. With `set-pot-contract-hash` now revocable (2.1 fixed), single-bad-audit risk is reduced — but cross-validation (winner ∈ participants etc.) is still missing. | 🟡 Partial. |
| X.2 | high | Trait-mediated `tx-sender` threading: pot → `as-contract` → stackspots → distribute chain depends on `tx-sender` remaining the pot principal. Adding `as-contract` anywhere along the chain silently breaks authorization. Use of `contract-caller` for the auth checks would be more robust. | ⚪ Open. |
| X.3 | high | Reward percentages 5+1+2+2+90 = 100%, but each `(/ (* X N) u100)` truncates. Residual dust accrues nowhere; small `pot-yield` values can floor a fee term to 0 and the `and (> X u0)` skip silently routes that share to no-one. | ⚪ Open. |
| X.4 | medium | `sim-pox-4` / `sim-pox-4-multi-pool-v1` references throughout (`stackspot-distribute`, all 3 pots). Not deployable to mainnet without parameterization. | ⚪ Open. |
| X.5 | medium | ERR codes redefined per contract — diverging in the future is a footgun; consider a shared error-codes module or doc tabulation. | ⚪ Open. |

---

## Top action items (priority order, original audit framing)

1. **VRF (CRITICAL)** — replace `tx-sender`-based entropy in `stackspot-vrf`; decouple winner-pick from claimer.
2. ✅ **`mint` access control** — restrict `stackspots.mint` to internal callers (done).
3. **`stackspot-sequencial-pot` math (CRITICAL × 3)** — fix `next-payment-id` off-by-one (11.1), distribute share-per-cycle logic (11.2), validate-can-claim-pot multiplication (11.3).
4. **`stackspot-crowd-fund-pot.funding-address` (CRITICAL)** — disclose at register-time and gate participants' opt-in (10.1, 10.2).
5. ✅ **Hash whitelist revocability** — `map-set` semantics (done).
6. **Off-by-one MAX_PARTICIPANTS (9.2), multiplied reward-release (8.1, 9.x, 10.x, 11.3)** — both still present in all 3 pot variants. `validate-can-join-pot` inversion ✅ fixed.
7. **Replace `sim-pox-4*` references** with epoch/network-aware addresses prior to mainnet.
8. **Dead reward calculations** in pot.claim-pot-reward — drop or unify with `stackspot-distribute`.
9. **Single-key admin** patterns (PRIMARY_ADMIN, platform-treasury, pot-admin) — propose+accept transfer.
10. **Hardcoded testnet bootstrap admin** in `stackspot-admin.clar:91` — remove or branch.

---

## Test coverage of these findings

Comprehensive vitest suites covering 238 test cases live under `tests/`.
Coverage of the stackspot contracts (after the work documented in this audit):

| Contract | Lines covered |
|---|---|
| stackspot-admin | 100.0% |
| stackspot-vrf | 100.0% |
| stackspot-registry | 100.0% |
| stackspots | 92.4% |
| stackspot-crowd-fund-pot | 65.7% |
| stackspot-sequencial-pot | 64.4% |
| stackspot-jackpot | 63.4% |
| stackspot-winners | 60.0% |
| stackspot-distribute | 31.1% |
| **TOTAL stackspot-*** | **66.0%** |

Findings tagged 🧪 above have corresponding regression tests in
`tests/`. Run with:

```bash
pnpm test           # unit
pnpm test:report    # with coverage + costs (writes lcov.info)
```
