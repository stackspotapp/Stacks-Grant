# StacksPot v5 — contract function map

## stackspots

**Public**
- `update-minimum-sponsor-amount`
- `add-update-admin-status`
- `update-public-pot-deploy-status`
- `set-pot-contract-hash`
- `update-fee`
- `register-pot`
- `log-pre-init`
- `log-join-pot`
- `log-join-pot-as-sponsor`
- `log-cancel-pot`
- `log-fall-back-cancel`
- `log-claim-pot-reward`
- `log-sponsor-platform`
- `transfer`
- `update-platform-sponsor-contract`
- `verify-platform-sponsor-contract`

**Read-only**
- `get-platform-treasury`
- `get-minimum-sponsor-amount`
- `is-admin`
- `can-deploy-pot`
- `is-contract-allowed-hash`
- `get-fee`
- `get-last-token-id`
- `get-token-uri`
- `get-owner`
- `get-token-id`
- `validate-platform-sponsor-contract`
- `get-pot-info`

**Private (representative)**
- `get-registered-pot-id`
- `assert-log-caller`
- `emit-log`
- `emit-sponsor-log`
- `mint`

## init-admin

**Public**
- `update-contract-hash`

## jackpot

**Public**
- `pull-staking-rewards`
- `join-pot`
- `join-pot-as-sponsor`
- `cancel-pot`
- `start-stackspot-jackpot`
- `claim-pot-reward`
- `init-pot`

**Read-only**
- `get-pool-config`
- `validate-can-join-pot`
- `validate-can-claim-pot`
- `validate-pot-value-target-is-met`
- `is-locked`
- `get-pot-details`
- `get-pot-treasury`
- `get-pot-admin`
- `get-staking-meta`
- `get-last-participant`
- `get-configs`
- `get-pot-value`
- `get-pot-participants`
- `get-sponsors-addresses`
- `get-pot-id`
- `get-platform-sponsor-ticket`
- `get-pot-is-init`

**Private (representative)**
- `bind-platform-sponsors`
- `delegate-to-pot`
- `stake-treasury`
- `dispatch-rewards`
- `dispatch-principals`
- `dispatch-sponsor-principals`

## sequential

**Public**
- `pull-staking-rewards`
- `join-pot`
- `join-pot-as-sponsor`
- `cancel-pot`
- `fall-back-cancel`
- `start-stackspot-sequential-pot`
- `claim-pot-reward`
- `init-pot`

**Read-only**
- `get-pool-config`
- `validate-can-fall-back-cancel`
- `validate-can-join-pot`
- `validate-can-claim-pot`
- `validate-pot-value-target-is-met`
- `get-pot-details`
- `get-staking-meta`
- `get-platform-sponsor-ticket`
- `get-pot-participants`
- `get-sponsors-addresses`

**Private (representative)**
- `bind-platform-sponsors`
- `delegate-to-pot`
- `stake-treasury`
- `extend-stake`
- `dispatch-principals`
- `dispatch-sponsor-principals`
- `dispatch-rewards`

## crowd-fund

**Public**
- `pull-staking-rewards`
- `join-pot`
- `join-pot-as-sponsor`
- `cancel-pot`
- `start-stackspot-crowdfund`
- `claim-pot-reward`
- `init-pot`

**Read-only**
- `get-pool-config`
- `validate-can-join-pot`
- `validate-can-claim-pot`
- `get-pot-details`
- `get-staking-meta`
- `get-platform-sponsor-ticket`

**Private (representative)**
- `bind-platform-sponsors`
- `delegate-to-pot`
- `stake-treasury`
- `dispatch-principals`
- `dispatch-sponsor-principals`
- `dispatch-rewards`

## stackspot-sponsor

**Public**
- `sponsor-platform`
- `claim-sponsor-reward`
- `update-rule-set`
- `sponsor-event`
- `transfer`
- `mint`

**Read-only**
- `get-pool-config`
- `get-minimum-sponsor-amount`
- `get-rule-sets`
- `get-total-rule-score`
- `get-last-token-id`
- `get-owner`

**Private (representative)**
- `mint-event-ticket`
- `get-total-validated-rule-score`
- `log-sponsor-event`
- `update-rule-loop`
- `check-rule-0`
- `check-rule-1`
- `check-rule-2`

## stackspot-vrf

**Public**

**Read-only**
- `get-random-uint-at-block`
- `generate-list`
