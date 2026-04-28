# StacksPot

**StacksPot** is a decentralized lottery-style staking platform on Stacks that coordinates STX delegation, sBTC yield-sharing, and on-chain logging. Participants contribute STX into **pots** (jackpot-style pools), those funds are delegated into Proof of Transfer (PoX) cycles to earn BTC-denominated yield (paid in sBTC), and rewards are distributed according to auditable on-chain rules—including a randomly selected winner, platform fees, and incentives for the pot starter and claimer.

This repository contains the Clarity smart contracts and simnet test suite. The **simnet** workspace is the authoritative simulation environment used for development; the **beta** workspace is a staging copy for testnet deployment preparation.

---

## Table of Contents

- [Overview](#overview)
- [Repository Structure](#repository-structure)
- [System Architecture](#system-architecture)
- [Contract Reference](#contract-reference)
- [Pot Lifecycle](#pot-lifecycle)
- [Reward Distribution](#reward-distribution)
- [Testing](#testing)
- [Security and Access Control](#security-and-access-control)
- [Dependencies](#dependencies)
- [Development](#development)
- [License](#license)

---

## Overview

### What StacksPot Does

- **Pot registry**: Each pot is represented by a non-transferable NFT in the `stackspots` contract. Only audited pot contracts can be registered and can later trigger pot value delegations.
- **Participation**: Users join pots by sending STX to the pot treasury (the pot contract’s principal). Join rules enforce minimum amount, maximum participants, and prevent the platform, pot admin, or treasury from joining. Once the pot is **locked**, no new participants can join.
- **Delegation**: After locking, the pot treasury’s STX can be delegated to PoX pools (via `stackspot-distribute` and the simnet PoX contracts) to earn yield during the reward cycle.
- **Settlement**: When the reward cycle has released, anyone may call the pot’s claim function. The contract refunds all participants’ principal (STX), selects a winner (randomly in Jackpot, or by moderator choice in Cryptonauts), and distributes sBTC yield to the platform, pot owner, starter, claimer, and winner according to fixed percentages.
- **Logging**: Registration and settlement events are logged through `stackspot-registry` and `stackspot-winners` for off-chain analytics and compliance.

### Key Concepts

| Term | Description |
|------|-------------|
| **Pot** | A single jackpot-style pool: one treasury (contract principal), a set of participants, and config (min amount, max participants, cycles, etc.). |
| **Pot treasury** | The contract principal that holds participants’ STX and receives sBTC yield. |
| **Pot admin** | The deployer/owner of the pot contract; can start the jackpot (and in Jackpot, cancel before lock). |
| **Pot starter** | The principal that called `start-stackspot-jackpot`; receives a share of sBTC rewards. |
| **Pot claimer** | The principal that called the claim function; receives a share of sBTC rewards. |
| **Locked** | After `start-stackspot-jackpot`, the pot is locked: no new joins, treasury may be delegated to PoX. |
| **Audited contract** | A pot implementation approved in `stackspot-audited-contracts`; required for minting new pots and for dispatch/delegate actions. |

---

## Repository Structure

```
stackspot-contracts/
├── README.md
├── simnet/
│   ├── Clarinet.toml          # Clarinet project and contract list
│   ├── contracts/            # Clarity contracts (see Contract Reference)
│   │   ├── stackspot-*.clar  # Core StacksPot contracts
│   │   ├── sbtc-*.clar       # sBTC token and registry (dependencies)
│   │   ├── sim-pox-4.clar
│   │   └── sim-pox4-multi-pool-v1.clar
│   └── tests/                # TypeScript tests (Vitest + Clarinet JS)
│       ├── utils.ts
│       ├── stackspot-happy-path.test.ts
│       ├── stackspots.test.ts
│       ├── stackspot-vrf.test.ts
│       ├── stackspot-rounding.test.ts
│       └── stackspot-cryptonauts.test.ts
└── beta/
    └── contracts/            # Staging copies for testnet deployment
```

Use the **simnet** contracts and tests as the source of truth; beta mirrors them for deployment packaging.

---

## System Architecture

### Contract Layering

1. **Governance and compliance**
   - **stackspot-admin**: Who can deploy pots; public deploy flag.
   - **stackspot-audited-contracts**: Which pot contract principals are allowed to be registered and to trigger dispatch/delegate.

2. **Registry and logging**
   - **stackspots**: NFT registry for pots; mints pot NFT, logs deployment, and exposes `dispatch-principals`, `dispatch-rewards`, and `delegate-treasury` that delegate to `stackspot-distribute`.
   - **stackspot-registry**: Receives deployment logs from `stackspots` only.
   - **stackspot-winners**: Receives settlement logs from `stackspot-distribute` only.

3. **Trait and pot implementations**
   - **stackspot-trait**: Interface that every pot must implement (treasury, participants, details, pool config, etc.).
   - **stackspot-jackpot**: Reference pot with VRF-based winner selection; one join per principal; pot admin can cancel before lock.
   - **stackspot-cryptonauts**: Alternative pot with moderator-selected winner; participants can add more STX over time; pot resets after payout; moderator-only start/cancel/claim.

4. **Treasury and distribution**
   - **stackspot-distribute**: Refunds principals (STX with memo), splits sBTC rewards (platform, owner, starter, claimer, winner), and delegates treasury STX to PoX (simnet).

5. **Randomness**
   - **stackspot-vrf**: Burn-block–anchored VRF used by Jackpot to pick a random participant index; also provides `generate-list` for ordered participant lists.

6. **External protocol (simnet)**
   - **sbtc-token**, **sbtc-registry**: SIP-010–style sBTC and registry.
   - **sim-pox-4**, **sim-pox4-multi-pool-v1**: PoX simulation for delegation and cycle timing.

### Call Flow (High Level)

- **Register pot**: Owner calls `stackspots.register-pot` (must pass `can-deploy-pot` and pay fee); contract mints NFT to pot contract, logs via `stackspot-registry`.
- **Join**: User calls `pot.join-pot(amount)`; STX goes to pot treasury with memo.
- **Start**: Pot admin calls `pot.start-stackspot-jackpot(pot)`; stackspots delegates treasury to itself then to PoX; pot locks.
- **Claim** (depends on pot type):
  - **stackspot-jackpot**: Any principal calls `pot.claim-pot-reward(pot)`. The pot selects the winner at random via VRF, then calls `stackspots.dispatch-principals` and `stackspots.dispatch-rewards`; stackspots forwards to `stackspot-distribute` for both; distribute logs via `stackspot-winners`.
  - **stackspot-cryptonauts**: Only the pot moderator calls `pot.cryptonauts-pay-winner(pot-contract, winner-address, cryptonauts-treasury-address)` and passes the chosen winner. The pot then calls `stackspots.dispatch-principals` and `stackspots.dispatch-rewards`; stackspots forwards to `stackspot-distribute`; distribute logs via `stackspot-winners`. The pot then resets participant state for the next round.

---

## Contract Reference

### Governance and Compliance

#### `stackspot-admin.clar`

- **Purpose**: Manages platform admins and whether anyone can deploy pots.
- **State**: `admins` (principal → bool), `public-pot-deploy` (bool). Deployer is the primary admin.
- **Public functions**:
  - `add-update-admin-status(admin principal, enable bool)` — Primary admin only; sets admin status.
  - `update-public-pot-deploy-status(enable bool)` — Any admin; toggles public pot deployment.
- **Read-only**: `is-admin`, `can-deploy-pot` — Used by `stackspots` and `stackspot-audited-contracts`.

#### `stackspot-audited-contracts.clar`

- **Purpose**: Allow-list of pot contract principals that are considered audited.
- **State**: `audited-contracts` (principal → bool).
- **Public functions**:
  - `update-audited-contract(contract <stackspot-trait>, is-audited bool)` — Admin only (via stackspot-admin).
  - `remove-audited-contract(contract <stackspot-trait>)` — Admin only.
- **Read-only**: `is-audited-contract(contract)` — Used by stackspots (register-pot, delegate-treasury) and by pot logic.

---

### Registry and Logging

#### `stackspots.clar`

- **Purpose**: Central pot registry and gate for principal refunds, reward distribution, and delegation.
- **Implements**: SIP-009 NFT trait as `stackpot-pot` (non-transferable; transfer always errors).
- **State**: `stackpot-pot` NFT, `pot-contract-with-index`, `pot-id-info`, `last-pot-index`, `fee`.
- **Public functions**:
  - `register-pot(pot-values)` — Registers a new pot: checks `can-deploy-pot`, balance ≥ fee, tx-sender is owner, contract hash non-empty; mints NFT to pot contract; logs via `stackspot-registry`; increments index.
  - `mint(recipient)` — Called by owner during register; recipient must be contract; transfers fee to platform; mints NFT to pot contract; stores pot info.
  - `dispatch-principals(contract)` — Callable only by the registered pot contract; forwards to `stackspot-distribute.dispatch-principals`.
  - `dispatch-rewards(contract)` — Callable only by the pot contract; forwards to `stackspot-distribute.dispatch-rewards`.
  - `delegate-treasury(contract, delegate-to)` — Requires audited contract; callable only by the pot contract; forwards to `stackspot-distribute.delegate-treasury`.
- **Read-only**: `get-fee`, `get-platform-treasury`, `get-token-id(owner)`, `get-pot-info(owner)`, NFT getters.

#### `stackspot-registry.clar`

- **Purpose**: Logs pot deployment data. Callable only by `stackspots`.
- **Public**: `log-pot(participant-values buff)` — Prints buffer for off-chain ingestion.

#### `stackspot-winners.clar`

- **Purpose**: Logs settlement data. Callable only by `stackspot-distribute`.
- **Public**: `log-winner(winner-values buff)` — Prints buffer for off-chain ingestion.

---

### Trait and Pot Implementations

#### `stackspot-trait.clar`

- **Purpose**: Standard interface for all StacksPot-compatible pots.
- **Surface**: Read-only getters for admin, treasury, pot-id, name, type, cycle, reward token, min/max amount, origin contract hash, pot value, last participant; `get-by-id-helper(id)`; `get-pot-details()` (participants count, value, reward amount, optional winner/starter/claimer, pool-config, locked, lock height, cancelled, is-joined); `get-pot-participants()`.

All pot implementations (Jackpot, Cryptonauts) implement this trait so that `stackspots` and `stackspot-distribute` can work with any compliant pot.

#### `stackspot-jackpot.clar`

- **Purpose**: Reference pot implementation: one join per principal, VRF-based winner, admin can start and (before lock) cancel.
- **Config (constants)**: `pot-cycle`, `pot-min-amount`, `pot-max-participants`, `pot-name`, `pot-type`, `origin-contract-sha-hash`.
- **State**: Participants (by principal and by id), `locked`, `lock-burn-height`, `pot-cancelled`, `first-user-joined`, `pot-starter-principal`, `pot-claimer-principal`, `winners-values`, `total-pot-value`, `last-participant`.
- **Public functions**:
  - `join-pot(amount)` — Requires not locked, amount ≥ min; prevents duplicate join; blocks pot treasury, platform, and pot admin; STX transferred to treasury with memo.
  - `cancel-pot(pot-contract)` — Pot admin only; pot must not be locked; requires at least one full cycle since first join; refunds principals via stackspots then sets `pot-cancelled`.
  - `start-stackspot-jackpot(pot-contract)` — Validates pot value target (≥ min×max), not cancelled, treasury matches; sets lock height; calls stackspots.delegate-treasury; sets starter; locks pot.
  - `claim-pot-reward(pot-contract)` — Validates claim window (reward release passed) and pot yield > 0; sets claimer and winner (VRF index); dispatches principals then rewards via stackspots; prints event.
- **Read-only**: `get-pool-config`, `validate-can-claim-pot`, `get-pot-details`, `get-pot-participants`, `get-random-index(participant-count)` (uses stackspot-vrf), and all trait getters.
- **Deployment**: Contract initializer registers the pot with stackspots using the config constants.

#### `stackspot-cryptonauts.clar`

- **Purpose**: Alternative pot with moderator-selected winner and repeat participation; pot state resets after payout.
- **Differences from Jackpot**:
  - **Moderator**: `pot-moderator` (deployer) must start, cancel, and call `cryptonauts-pay-winner`. Pot admin cannot cancel; only moderator can.
  - **Participation**: Same principal can call `join-pot` multiple times; amount is added to existing entry (single slot per principal, cumulative amount).
  - **Winner**: Chosen by caller: `cryptonauts-pay-winner(pot-contract, winner-address, cryptonauts-treasury-address)`.
  - **After payout**: Participant maps are cleared and pot vars reset (`reset-pot-values`), so the same contract can run another round.
- **Rewards**: In the current implementation, platform royalty, pot fee, starter, and claimer rewards are set to 0; winner receives full pot yield (minus any future splits if added).
- **Public functions**: `join-pot`, `cancel-pot` (moderator only), `start-stackspot-jackpot` (moderator only), `cryptonauts-pay-winner(pot-contract, winner-address, cryptonauts-treasury-address)` (moderator only).

---

### Treasury and Distribution

#### `stackspot-distribute.clar`

- **Purpose**: Executes principal refunds (STX), sBTC reward splits, and (in simnet) treasury delegation to PoX.
- **Public functions**:
  - `dispatch-principals(contract)` — Called by stackspots only; tx-sender must be pot treasury. Fetches participants from pot, transfers each participant’s principal (STX) back with memo `"participant principal"`.
  - `dispatch-rewards(contract)` — Called by stackspots only; tx-sender must be pot treasury. Ensures claim window and yield > 0; computes 1% platform royalty, 5% pot fee to owner, 2% starter, 2% claimer, remainder to winner; transfers sBTC via `sbtc-token.transfer` with memos; calls `stackspot-winners.log-winner` with full settlement buffer.
  - `delegate-treasury(contract, delegate-to)` — Called by stackspots only; tx-sender must be pot treasury. Delegates treasury’s STX balance to the PoX multi-pool (simnet) with memo `{c: "sbtc"}`.
- **Read-only**: `get-pox-info`, `get-pool-config(lock-burn-height)`, `validate-can-claim-pot(lock-burn-height, pot-cycle)`.

---

### Randomness

#### `stackspot-vrf.clar`

- **Purpose**: Burn-block–anchored randomness for fair winner selection and list generation.
- **Public**: `get-random-uint-at-block(blockHeight)` — Uses Stacks block header hash at `blockHeight - 1` and `tx-sender` principal; concatenates, SHA256, takes lower 16 bytes (little-endian), returns as uint. Used by Jackpot to derive a random participant index.
- **Read-only**: `lower-16-le(32-byte buffer)` — Returns lower 16 bytes (for VRF); `generate-list(start, length)` — Returns a fixed list slice (indices 0..99) for iterating participants in a deterministic order.

---

### Dependencies (Simnet)

- **sbtc-token.clar**: SIP-010–style fungible token (liquid and locked); protocol mint/burn/lock via sbtc-registry. Used for sBTC reward transfers.
- **sbtc-registry.clar**: Protocol roles and authorization for sbtc-token.
- **sim-pox-4.clar**: PoX-4 simulation; provides cycle lengths and burn-block timing.
- **sim-pox4-multi-pool-v1.clar**: Self-service stacking pool wrapper; stackspot-distribute delegates treasury STX here in simnet.

These are required for the simnet environment but are external to the core StacksPot design; they are not modified as part of normal StacksPot development.

---

## Pot Lifecycle

1. **Deploy and register**
   - Deploy a pot contract (e.g. stackspot-jackpot or stackspot-cryptonauts). The initializer typically calls `stackspots.register-pot` with owner, contract principal, cycles, type, reward token, min/max, and contract-sha-hash.
   - Registration requires `stackspot-admin.can-deploy-pot`, tx-sender = owner, owner balance ≥ platform fee, and non-empty contract hash. The pot contract must be marked audited (via `stackspot-audited-contracts`) before it can use dispatch/delegate.

2. **Join**
   - Users call `pot.join-pot(amount)`. Pot must not be locked; amount ≥ min; principal not already in (Jackpot) or will be merged (Cryptonauts); principal not treasury/platform/admin. STX is sent to the pot treasury with a join memo.

3. **Start (lock and delegate)**
   - Pot admin (Jackpot) or moderator (Cryptonauts) calls `pot.start-stackspot-jackpot(pot)`. Validations include: not already locked, value target met (Jackpot), not cancelled, treasury = pot contract. Then: set lock height, call `stackspots.delegate-treasury`, set starter, set `locked = true`.

4. **Reward cycle**
   - During the lock period, the treasury’s STX is delegated to PoX (simnet). sBTC yield is credited to the treasury (or simulated). `validate-can-claim-pot` uses PoX cycle timing and `pot-cycle` to determine when rewards are releasable.

5. **Claim** — Behavior differs by pot type:

   **stackspot-jackpot**
   - Once the reward-release height has passed, **any principal** may call `claim-pot-reward(pot-contract)`.
   - The pot sets the claimer to `tx-sender`, selects the **winner at random** via `stackspot-vrf` (VRF at current block), then calls `stackspots.dispatch-principals` and `stackspots.dispatch-rewards`. Stackspots forwards to `stackspot-distribute`; principals are refunded (STX) and sBTC is split (platform, owner, starter, claimer, winner). `stackspot-distribute` logs the settlement via `stackspot-winners`.
   - The pot remains in a claimed state; no reset.

   **stackspot-cryptonauts**
   - Once the reward-release height has passed, **only the pot moderator** may call `cryptonauts-pay-winner(pot-contract, winner-address, cryptonauts-treasury-address)`. The **winner is chosen by the caller** (not random).
   - The pot sets the claimer to `tx-sender` and the winner to the provided `winner-address`, then calls `stackspots.dispatch-principals` and `stackspots.dispatch-rewards`. Stackspots forwards to `stackspot-distribute`; principals are refunded and sBTC is distributed; distribute logs via `stackspot-winners`.
   - The pot then **resets** participant maps and pot vars (`reset-pot-values`) so the same contract can run another round.

6. **Cancel (Jackpot only, before lock)**
   - Pot admin calls `cancel-pot(pot-contract)`. Pot must not be locked and at least one full cycle must have passed since first join. Principals are refunded via `stackspots.dispatch-principals`; `pot-cancelled` is set so the pot cannot be started.

---

## Reward Distribution

When `stackspot-distribute.dispatch-rewards` runs (after principals are refunded), sBTC in the pot treasury is split as follows:

| Recipient    | Share of pot yield | Memo / purpose        |
|-------------|--------------------|------------------------|
| Platform    | 1%                 | Platform royalty       |
| Pot owner   | 5%                 | Pot fee reward         |
| Pot starter | 2%                 | Pot starter reward     |
| Claimer     | 2%                 | Claimer reward         |
| Winner      | Remainder (~90%)   | Winner reward          |

All amounts are computed with integer division. Small yields can round some shares to zero; the winner receives the remainder so no sBTC is left in the treasury (see `stackspot-rounding.test.ts`). Transfers use `sbtc-token.transfer` with consensus-buff memos for auditability.

---

## Testing

Tests live in `simnet/tests/` and use Vitest with the Clarinet JS SDK (`simnet` global).

### Test Files

- **utils.ts**: Helpers `expectSbtcTransferEvent` and `expectStxTransferEvent` for asserting FT and STX transfer events.
- **stackspot-happy-path.test.ts**: Full flow: deploy pot, add admin, mark audited, mint sBTC, set pool; user joins; admin starts jackpot; rewards sent to pot; advance to reward release; claim; assert STX principal return and sBTC splits (platform, pot fee, starter, claimer, winner). Also: join then cancel after mining past one cycle (ERR_TOO_EARLY then success).
- **stackspots.test.ts**: Join-pot rules: join once then second join fails (ERR_DUPLICATE_PARTICIPANT); join below minimum (ERR_INSUFFICIENT_AMOUNT); pot owner cannot join (ERR_UNAUTHORIZED); platform address cannot join (ERR_UNAUTHORIZED); insufficient balance (ERR_POT_JOIN_FAILED).
- **stackspot-vrf.test.ts**: `lower-16-le` behavior: lower 16 bytes of 32-byte buffer, little-endian, edge cases (zeros, max, same lower bytes different upper bytes).
- **stackspot-rounding.test.ts**: Small reward amount (50 sats): platform royalty rounds to 0; pot fee, starter, claimer get 2, 1, 1; winner gets the remainder (46). Confirms no dust left and correct rounding.
- **stackspot-cryptonauts.test.ts**: Minimal simnet sanity check (e.g. simnet initialized).

### Running Tests

```bash
cd simnet
npm install
npm test
```

Optional: `clarinet test` for Clarinet-native tests if configured.

---

## Security and Access Control

- **Admins**: Only the primary admin (deployer of stackspot-admin) can add/update admins. Only admins can toggle public pot deploy and manage audited contracts.
- **Pot registration**: Requires `can-deploy-pot`, sufficient balance for fee, tx-sender = owner, and non-empty contract hash. Mint recipient must be a contract.
- **Dispatch and delegation**: Only the registered pot contract (matching `get-pot-info`) may call `stackspots.dispatch-principals`, `dispatch-rewards`, and `delegate-treasury`. `delegate-treasury` additionally requires the pot to be audited.
- **Distribute**: `stackspot-distribute` accepts dispatch/delegate only when `contract-caller` is stackspots and `tx-sender` is the pot treasury (so only stackspots on behalf of the pot can trigger).
- **Registry and winners**: Only stackspots can call `stackspot-registry.log-pot`; only stackspot-distribute can call `stackspot-winners.log-winner`.
- **Pot rules**: Join/cancel/start/claim enforce treasury vs platform vs admin, locked state, cycle timing, and (Jackpot) value target and (Cryptonauts) moderator.
- **Funds**: Principal refunds use memoized STX transfers; sBTC rewards use memoized transfers and fixed percentages; claim is only after reward-release height.

---

## Dependencies

- **Clarinet** and **Clarity** (version and epoch per `Clarinet.toml`).
- **Vitest** and **@stacks/transactions** (and **@stacks/common**) for simnet tests.
- **NFT trait**: `SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait` (and optional `ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT.nft-trait`) as project requirements in simnet.

---

## Development

1. **Simnet**: Work in `simnet/`. Run `npm test` and `clarinet check` before committing.
2. **New pot type**: Implement `stackspot-trait`; add to `stackspot-audited-contracts` in simnet; register via `stackspots.register-pot` (e.g. in contract initializer).
3. **Testnet (beta)**: Copy simnet contracts to `beta/contracts`, update `Clarinet.toml` principals for target network, run `clarinet check` and deployment scripts as needed.

---

## License

Licensed under GPL-3.0. Contributions welcome; please run the simnet test suite and keep documentation aligned with the contracts in `simnet/contracts`.
