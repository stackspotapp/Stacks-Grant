# `.crowd-fund` QA — 5 cycles

<a name="summary"></a>

## Summary

**5 confirmed findings:** 5 High. Same S1–S6 + A–D harness, `init-pot` cycle count **5**. Recorder: **11 passed**. Claim/cancel at end mined to burn **13033**.

| ID | Severity / type | Issue | Summary |
| --- | --- | --- | --- |
| [I01](#i01) | High | [Deploy-time `log-pre-init` still `u1110`](#i01) | `deployContract` is `err u1110`. Copy hash is allowed immediately after. Contract remains callable. |
| [I02](#i02) | High | [Claim replay returns `ok`](#i02) | S1 `claim-twice` / `second-claim` are `ok`. S6 empty claim after platform-sponsor claim is also `ok`. |
| [I03](#i03) | High | [Closer is any `tx-sender`](#i03) | S1 `claim-empty-closer` from `wallet_8` is `ok`; closer received 1358 sats. |
| [I06](#i06) | High | [`cancel-pot` panics before start](#i06) | D `cancel-before-start` is runtime `UnwrapFailure`. Immediate after start is `err u1408`. |
| [I07](#i07) | High | [Mid-duration cancel is `ok` on a 5-cycle pot](#i07) | S3 `cancel-mid-cycle` at burn **5254** is **`ok`**. Same step on 1-cycle was `err u1408`. |

**Report sections:** [Evidence scope](#evidence-scope) · [Function coverage](#function-coverage) · [Detailed findings](#findings) · [Remaining coverage](#remaining-coverage) · [Reproduction](#reproduction)

## Report context

Date: 2026-10-20 (re-run). P = Clarinet `deployer`; D = `wallet_2` pots. `potCycles: 5`, PoX cycle length 2100.

Source SHA-256 `crowd-fund.clar`: `2775a6dfc0e7b8e09ce6645ac12ac611333191ae7376cba33b8bb71dae568ea5`.  
Source SHA-256 `stackspots.clar`: `e3d689a1064ad4c840340c545758a799a2a1a0343ee55ca2ada33495e2b1d5f3`.

<a name="evidence-scope"></a>

## Result and evidence scope

`deployContract` **`err u1110`**. Empty and platform-sponsor `init-pot` **`ok`**. Genesis and copy `is-contract-allowed-hash` **`{"type":"true"}`**. S1 claim burn 13033 **`ok`**. S2/S4 cancel at end **`ok`**. S6 `claim-with-platform-sponsor-list` **`ok`**. S3 mid-cancel burn 5254 **`ok`**.

<a name="function-coverage"></a>

## Function coverage

| Function | Executed diagnostic checks |
| --- | --- |
| deploy (exact source, D) | `err u1110`; genesis and copy `is-contract-allowed-hash` `{"type":"true"}` (I01). |
| `init-pot` empty sponsors | **ok**. |
| `init-pot` with `.stackspot-sponsor` | **ok**. |
| `claim-pot-reward` empty list | First closer `wallet_8` **ok** (I03) at burn 13033. Owner **ok**; `claim-twice` **ok** (I02). |
| `claim-pot-reward` + platform sponsor | **ok**. Empty list after that **ok** (I02). |
| `cancel-pot` at cycle end | **ok**. |
| `cancel-pot` mid 5-cycle (burn 5254) | **ok** (I07). |
| `cancel-pot` immediately after start | **err u1408**. |
| `cancel-pot` before start | runtime `UnwrapFailure` (I06). |

S1 post-claim sBTC: closer `wallet_8` 1358; D 65_908; `stackspots` 679; pot 0 STX. S6 post-claim: D 67_266 sats; `stackspots` 679.

<a name="findings"></a>

## Findings and code suggestions

<a name="i01"></a>

### I01 — High: deploy-time `log-pre-init` returns `u1110`

`v5/simnet-ai/contracts/crowd-fund.clar:886–890` → `stackspots.clar:284`.

S1–S6, A–D: `deployContract` **`err u1110`**. Same block: genesis and copy `is-contract-allowed-hash` **`{"type":"true"}`**. `init-pot` then **`ok`**.

[Back to summary](#summary)

<a name="i02"></a>

### I02 — High: second `claim-pot-reward` returns `ok`

`v5/simnet-ai/contracts/crowd-fund.clar:587–591`.

S1: `claim-twice` / `second-claim` **`ok`** at burn 13033. S6: `claim-with-platform-sponsor-list` **`ok`**, `claim-empty-sponsors` **`ok`**.

[Back to summary](#summary)

<a name="i03"></a>

### I03 — High: closer fee is paid to any `tx-sender`

`v5/simnet-ai/contracts/crowd-fund.clar:615–616`.

S1 `claim-empty-closer` caller `ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP` **`ok`**. `extra` sBTC **1358**.

[Back to summary](#summary)

<a name="i06"></a>

### I06 — High: `cancel-pot` before start panics

`v5/simnet-ai/contracts/crowd-fund.clar:740–745`.

D `cancel-before-start` **`none`**, runtime `UnwrapFailure`. S3/S5 immediate **`err u1408`**.

[Back to summary](#summary)

<a name="i07"></a>

### I07 — High: mid-duration `cancel-pot` returns `ok` on a 5-cycle pot

`v5/simnet-ai/contracts/crowd-fund.clar:737–745`, `more_than_one_cycle` `:56`.

S3 `cancel-immediately` burn 3 **`err u1408`**. S3 `cancel-mid-cycle` burn **5254** **`ok`**. Unlocked branch is `first-user-joined + more_than_one_cycle`, not `(* more_than_one_cycle pot-cycle)`.

[Back to summary](#summary)

<a name="remaining-coverage"></a>

## Remaining coverage

- Immediate post-start cancel **err u1408** still holds at burn 3.

<a name="reproduction"></a>

## Reproduction

```bash
cd v5/simnet-ai
npx vitest run tests/five-cycle-lifecycle.test.ts --pool=threads --maxWorkers=1
```

Recorder: **11 passed**. Log: `v5/simnet-ai/reports/five-cycle-audit-run.json`.
