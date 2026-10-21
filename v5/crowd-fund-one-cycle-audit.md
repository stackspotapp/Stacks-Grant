# `.crowd-fund` QA

<a name="summary"></a>

## Summary

**4 confirmed findings:** 4 High. Exact-source wallet_2 pots **init (including platform sponsor), fund, start, claim, and cancel**. Genesis and copy hash allowlist both `true`. Recorder: **11 passed**.

| ID | Severity / type | Issue | Summary |
| --- | --- | --- | --- |
| [I01](#i01) | High | [Deploy-time `log-pre-init` still `u1110`](#i01) | `deployContract` is `err u1110`. Copy hash is allowed immediately after. Contract remains callable. |
| [I02](#i02) | High | [Claim replay returns `ok`](#i02) | S1 `claim-twice` / `second-claim` are `ok`. S6 empty claim after platform-sponsor claim is also `ok`. |
| [I03](#i03) | High | [Closer is any `tx-sender`](#i03) | S1 `claim-empty-closer` from `wallet_8` is `ok`; closer received 271 sats. |
| [I06](#i06) | High | [`cancel-pot` panics before start](#i06) | D `cancel-before-start` is runtime `UnwrapFailure` in `cancel-pot`. After start, early cancel is `err u1408`. |

**Report sections:** [Evidence scope](#evidence-scope) · [Function coverage](#function-coverage) · [Detailed findings](#findings) · [Remaining coverage](#remaining-coverage) · [Reproduction](#reproduction)

## Report context

Date: 2026-10-20 (re-run). P = Clarinet `deployer`; D = `wallet_2` pots; participants `wallet_3–5`; human sponsor `wallet_6`; Fastpool LP `wallet_7`; extra closer `wallet_8`. Audit harness was not used to edit contracts.

Simnet: every app contract is **`clarity-version: 6`**. Platform `init-admin-late` recorded **before** any wallet_2 deploy (`is-contract-allowed-hash(.crowd-fund)` `{"type":"true"}`, `validate-platform-sponsor-contract` `{"type":"true"}`).

Source SHA-256 `crowd-fund.clar`: `2775a6dfc0e7b8e09ce6645ac12ac611333191ae7376cba33b8bb71dae568ea5`.  
Source SHA-256 `stackspots.clar`: `e3d689a1064ad4c840340c545758a799a2a1a0343ee55ca2ada33495e2b1d5f3`.

<a name="evidence-scope"></a>

## Result and evidence scope

Exact-source `crowd-fund.clar` at D: `deployContract` **`err u1110`**, then `init-pot` empty sponsors **`ok`**, `init-pot` with `.stackspot-sponsor` **`ok`**. Hash of genesis `.crowd-fund` and of each `wallet_2.cf-s*` both allowed (`{"type":"true"}`). S1 claim at burn 4633 **`ok`**. S2/S4 cancel at end **`ok`**. S6 `claim-with-platform-sponsor-list` **`ok`**. Fastpool LP still holds 1_000_000 STX, not the pot.

<a name="function-coverage"></a>

## Function coverage

| Function | Executed diagnostic checks |
| --- | --- |
| deploy (exact source, D) | `err u1110`; genesis and copy `is-contract-allowed-hash` `{"type":"true"}` (I01). |
| `init-pot` empty sponsors | **ok**. Unauthorized `wallet_8` **err u1102**. Duplicate **err u1409**. |
| `init-pot` with `.stackspot-sponsor` | **ok**. |
| `join-pot` | 100/200/300 STX **ok**. Zero / below-min **err u1301**. Duplicate **err u1201**. |
| `join-pot-as-sponsor` | 1000 STX **ok**. Zero **err u1301**. Duplicate **err u1202**. |
| `start-pot` | **ok**. Uninitialized **err u1001**. |
| `claim-pot-reward` empty list | First closer `wallet_8` **ok** (I03). Owner then **ok**; `claim-twice` **ok** (I02). Before release **err u1402**. After cancel **err u1404**. |
| `claim-pot-reward` + platform sponsor | **ok**. Empty list after that **ok** (I02). |
| `cancel-pot` at cycle end | **ok**; STX returned. Second cancel **err u1404**. |
| `cancel-pot` before cycle end | **err u1408** at burn 3 and 1054 (S3 immediate/unauth/mid; S5 immediate). |
| `cancel-pot` before start | runtime `UnwrapFailure` (I06). |

S1 post-claim sBTC: closer `wallet_8` 271; D (starter/owner) 13_183; `stackspots` 135; pot 0 STX. Participants’ 1_600 STX restored. S2/S4 post-cancel: pot 0 STX; participants/sponsor restored. S6 post-claim: D 13_454 sats; `stackspots` 135; pot 0 STX.

<a name="findings"></a>

## Findings and code suggestions

<a name="i01"></a>

### I01 — High: deploy-time `log-pre-init` returns `u1110`

`v5/simnet-ai/contracts/crowd-fund.clar:886–890` → `stackspots.clar:284` → `assert-log-caller` `:386–388`.

Observed (S1–S6, A–D): `deployContract` **`err u1110`**. Same block: `is-contract-allowed-hash` genesis **`{"type":"true"}`**, wallet_2 copy **`{"type":"true"}`**. `init-pot` then **`ok`**.

Current:

```clarity
(define-private (pre-log-init)
  (as-contract? () (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots log-pre-init PRE_INIT_LOG)))
)
(pre-log-init)
```

```clarity
(asserts! (is-contract-allowed-hash contract-caller) ERR_UNAUTHORIZED_CONTRACT_HASH)
```

During publish, `contract-hash?` of the contract being published is none, so the allowlist map is not consulted. After the tx, the copy hash matches genesis (`e619f8189cd6e4d1b4e1dabe48e7e59c4a35c10d27e3d3b12de0949cc182473b`). Suggested: emit pre-init from `init-pot` after publish.

[Back to summary](#summary)

<a name="i02"></a>

### I02 — High: second `claim-pot-reward` returns `ok`

`v5/simnet-ai/contracts/crowd-fund.clar:587–591`, `:616`.

S1: `claim-empty-closer` **`ok`**, `claim` **`ok`**, `claim-twice` **`ok`**, `second-claim` **`ok`**. S6: `claim-with-platform-sponsor-list` **`ok`**, then `claim-empty-sponsors` **`ok`**.

Current:

```clarity
(asserts! (not (var-get pot-cancelled)) err_pot_cancelled)
(asserts! (can-claim-pot) err_pot_claim_not_reached)
;; no already-claimed / session-ended assert
```

Suggested:

```clarity
(asserts! (not (var-get pot-session-ended)) err_pot_session_ended)
```

[Back to summary](#summary)

<a name="i03"></a>

### I03 — High: closer fee is paid to any `tx-sender`

`v5/simnet-ai/contracts/crowd-fund.clar:615–616`.

S1 `claim-empty-closer` caller `ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP` (`wallet_8`) **`ok`**. S1-post-claim: `extra` sBTC **271**.

Current:

```clarity
(claimer tx-sender)
(claimer-reward (if (> pot-yield u0) (* (/ pot-yield u100) u2) u0))
```

Suggested (policy): restrict closer to pot admin / starter, or keep permissionless but document it.

[Back to summary](#summary)

<a name="i06"></a>

### I06 — High: `cancel-pot` before start panics

`v5/simnet-ai/contracts/crowd-fund.clar:740–745`.

D `cancel-before-start` result **`none`**. Exact:

```
D cancel-before-start runtime: Call contract function error: ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.cf-extra-d::cancel-pot('ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.cf-extra-d) -> Error calling contract function 'cancel-pot': Runtime error while interpreting ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.cf-extra-d: Runtime(UnwrapFailure, Some([FunctionIdentifier { identifier: "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.cf-extra-d:cancel-pot" }, FunctionIdentifier { identifier: "_native_:special_let" }, FunctionIdentifier { identifier: "_native_:special_asserts" }, FunctionIdentifier { identifier: "_native_:special_or" }, FunctionIdentifier { identifier: "_native_:special_and" }, FunctionIdentifier { identifier: "_native_:special_ge" }, FunctionIdentifier { identifier: "_native_:native_unwrap" }]))
```

S3: `cancel-immediately` **`err u1408`**, `cancel-unauth-immediate` **`err u1408`**, `cancel-mid-cycle` **`err u1408`**. S5 `cancel-immediately` **`err u1408`**.

Current:

```clarity
(and (> burn-block-height (+ (unwrap-panic (var-get lock-burn-height)) (* more_than_one_cycle (var-get pot-cycle)))) is-locked)
(and (> burn-block-height (+ (unwrap-panic (var-get first-user-joined)) more_than_one_cycle)) (not is-locked))
```

Suggested: `unwrap!` those optionals to `err_too_early` (`u1408`) when `none`.

[Back to summary](#summary)

<a name="remaining-coverage"></a>

## Remaining coverage

- Clarinet still emits `init-admin` before `stackspot-sponsor` in `default.simnet-plan.yaml`; harness uses deployer `init-admin-late`.
- Early cancel **err u1408** is the implemented time gate after start, not a panic.

<a name="reproduction"></a>

## Reproduction

```bash
cd v5/simnet-ai
npx vitest run tests/one-cycle-lifecycle.test.ts --pool=threads --maxWorkers=1
```

Recorder: **11 passed**. Log: `v5/simnet-ai/reports/one-cycle-audit-run.json`. Exact-source pots from `wallet_2` after deployer `init-admin-late`. No per-pot `set-pot-contract-hash`.
