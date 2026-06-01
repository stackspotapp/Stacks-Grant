# ADDRESSES

| Address | Description / Role |
|---|---|
| `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM` | Protocol administrator / deployer account used for admin authorization, PoX configuration, and sBTC reward minting operations. |
| `ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5` | Primary contract deployer and owner of the `stackspot-jackpot` contract used throughout the test scenarios. |
| `ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG` | Reserved testing account available for additional participant, admin, or simulation-based operations. |
| `ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC` | Participant Account #1 used for joining jackpot pots and testing contribution flows. |
| `ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND` | Participant Account #2 used for multi-user contribution testing scenarios. |
| `ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB` | Participant Account #3 used for validating cumulative participant accounting and liquidity aggregation. |
| `ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0` | Jackpot operator/executor account responsible for starting jackpot execution and handling cancellation operations. |
| `ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP` | Reward claimant/refund participant account used for testing claim and refund execution flows. |
| `ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ` | Additional reserve testing account available for extended jackpot or participant simulations. |
| `STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6` | Designated beneficiary/operator principal used during pot initialization and administrative configuration. |

---

# SCENARIO 1:
This scenario demonstrates the complete happy-path execution flow of the StackSpot crowdfunding jackpot lifecycle.  
The flow is executed sequentially to simulate a real-world successful operation — beginning from protocol/admin setup,  
pot initialization, participant deposits, jackpot activation, reward funding, and finally reward claiming.

The purpose of this scenario is to validate that:
- Administrative setup executes correctly.
- Pool delegation and PoX configuration are properly initialized.
- Pot creation stores the expected metadata and configuration.
- Multiple participants can successfully join the pot with varying contribution amounts.
- Jackpot execution starts correctly after setup completion.
- Burn chain advancement simulates passage of blockchain cycles required for reward maturity.
- Rewards can be funded into the contract.
- A winner can successfully claim rewards.
- Final state queries correctly reflect updated contract state after reward distribution.

---

# ADMIN / PROTOCOL SETUP

```clarity
::set_tx_sender ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM

;; Sets the approved jackpot/pot contract hash inside the admin contract.
;; This acts as a protocol authorization step, allowing the target contract
;; to interact with privileged StackSpot ecosystem functionality.
(contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-admin set-pot-contract-hash 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot true)

;; Activates the PoX reward address used by the simulated multi-pool stacking contract.
;; This represents enabling the Bitcoin payout address that receives stacking rewards.
(contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sim-pox-4-multi-pool-v1 set-pool-pox-address-active (tuple (hashbytes 0x7321b74e2b6a7e949e6c4ad313035b1665095017) (version 0x01)))
```

---

# POT INITIALIZATION

```clarity
::set_tx_sender ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5

;; Initializes a new jackpot/pot instance.
;;
;; Parameters:
;; u1                     -> Pot ID
;; u100000                -> Minimum contribution amount
;; u100                   -> Maximum participant limit or configured threshold
;; "test-001"             -> Human-readable pot identifier
;; "stackspot-crowdfund"  -> Pot/project name
;; 'STNHK...              -> Designated beneficiary/operator principal
;;
;; This establishes the core pot configuration and stores all metadata
;; required for subsequent participation and jackpot operations.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot init-pot u1 u100000 u100 "test-001" "stackspot-crowdfund" 'STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6)
```

---

# PARTICIPANT CONTRIBUTIONS

```clarity
::set_tx_sender ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC

;; Retrieves current pot configuration/state before participation begins.
;; Useful for validating initialization state and ensuring the pot is active.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot get-pot-details)

;; Participant #1 joins the pot with a contribution of 100000000 units.
;; This should register the participant and update total pool liquidity.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot join-pot u100000000)

::set_tx_sender ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND

;; Participant #2 joins the pot with a larger contribution amount.
;; Verifies support for multiple participants and cumulative accounting.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot join-pot u200000000)

::set_tx_sender ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB

;; Participant #3 joins the pot.
;; This validates participant indexing/storage consistency across multiple entries.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot join-pot u300000000)

;; Retrieves updated pot state after all contributions.
;; Expected updates include:
;; - Increased total liquidity
;; - Updated participant count
;; - Active participation records
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot get-pot-details)

;; Retrieves the complete participant registry/list.
;; Used to verify all participant entries were persisted correctly.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot get-pot-participants)
```

---

# JACKPOT ACTIVATION

```clarity
::set_tx_sender ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0

;; Starts the StackSpot jackpot execution process for the specified pot.
;;
;; This step simulates:
;; - Delegation finalization
;; - Jackpot activation
;; - Stacking lifecycle initiation
;; - Reward generation eligibility
;;
;; At this stage, the pot should transition into an active jackpot state.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot start-stackspot-jackpot 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot)
```

---

# BLOCKCHAIN CYCLE ADVANCEMENT

```clarity
;; Advances the simulated Bitcoin burn chain by 2400 blocks.
;;
;; This is critical because stacking rewards and PoX-related operations
;; depend on blockchain cycle progression and maturity periods.
;;
;; Advancing the chain simulates the waiting period required before
;; rewards become claimable.
::advance_burn_chain_tip 2400
```

---

# REWARD FUNDING

```clarity
::set_tx_sender ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM

;; Mints and transfers sBTC rewards into the jackpot contract.
;;
;; Parameters:
;; u2000                  -> Reward amount being minted
;; contract principal     -> Receiving jackpot contract
;; 0x01                   -> Optional memo/version payload
;;
;; This simulates external reward funding after successful stacking operations.
(contract-call? .sbtc-token protocol-mint u2000 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot 0x01)
```

---

# REWARD CLAIMING

```clarity
::set_tx_sender ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP

;; Executes jackpot reward claiming flow.
;;
;; Expected successful operations:
;; - Winner validation
;; - Reward eligibility verification
;; - Transfer of accumulated jackpot rewards
;; - Internal state updates marking the reward as claimed
;;
;; This represents the final stage of the complete jackpot lifecycle.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot claim-pot-reward 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot)

;; Retrieves final pot state after reward distribution.
;;
;; Expected changes may include:
;; - Claimed reward status
;; - Updated balances
;; - Jackpot completion flags
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot get-pot-details)

;; Retrieves final participant state for post-claim verification.
;; Used to confirm participant records remain intact after payout execution.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot get-pot-participants)
```

---

# END


# SCENARIO 2:
This flow tests the pot cancellation functionality after participant contributions have been made, but no delegation or jackpot execution occurs within a complete stacking cycle.  

The scenario simulates a failed or inactive jackpot lifecycle where:
- Participants successfully contribute funds into the pot.
- No delegation or jackpot activation is executed.
- The blockchain cycle advances beyond the allowed execution window.
- The pot becomes eligible for cancellation.
- The contract administrator/operator cancels the inactive pot.
- Participants are then able to reclaim/refund their contributed assets through the reward claim flow.

The purpose of this scenario is to validate that:
- Participant deposits are correctly stored before cancellation.
- Pot inactivity across a full cycle is properly handled.
- Cancellation logic only becomes available after the required cycle advancement.
- Pot state transitions correctly into a cancelled state.
- Participants can safely recover assets after cancellation.
- Contract state remains consistent after cancellation and claims are processed.

---

# ADMIN / PROTOCOL SETUP

```clarity
::set_tx_sender ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM

;; Registers and authorizes the jackpot/pot contract hash
;; within the StackSpot admin contract.
;;
;; This grants the target contract permission to interact
;; with privileged StackSpot protocol operations.
(contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-admin set-pot-contract-hash 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot true)

;; Activates the simulated PoX payout address used
;; by the multi-pool stacking contract.
;;
;; This represents enabling the Bitcoin reward address
;; that would normally receive stacking rewards.
(contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sim-pox-4-multi-pool-v1 set-pool-pox-address-active (tuple (hashbytes 0x7321b74e2b6a7e949e6c4ad313035b1665095017) (version 0x01)))
```

---

# POT INITIALIZATION

```clarity
::set_tx_sender ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5

;; Creates and initializes a new crowdfunding jackpot pot.
;;
;; Parameters:
;; u1                    -> Pot ID
;; u100000               -> Minimum contribution amount
;; u100                  -> Participant limit or configured threshold
;; "test-001"            -> Human-readable test identifier
;; "stackspot-jackpot"   -> Pot/project name
;;
;; This initializes the pot configuration and prepares
;; the contract for participant deposits.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot init-pot u1 u100000 u100 "test-001" "stackspot-jackpot")
```

---

# PARTICIPANT CONTRIBUTIONS

```clarity
::set_tx_sender ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC

;; Retrieves the initial pot state before contributions begin.
;;
;; Used to verify:
;; - Pot initialization
;; - Pot status
;; - Initial balances and participant counts
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot get-pot-details)

;; Participant #1 joins the pot with a contribution
;; of 100000000 units.
;;
;; This should:
;; - Register the participant
;; - Increase total liquidity
;; - Update participant tracking
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot join-pot u100000000)

::set_tx_sender ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND

;; Participant #2 joins the pot with a larger contribution amount.
;;
;; Validates multi-user contribution accounting.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot join-pot u200000000)

::set_tx_sender ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB

;; Participant #3 joins the pot.
;;
;; Confirms participant indexing and cumulative
;; liquidity updates remain consistent.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot join-pot u300000000)

;; Retrieves updated pot state after all participant deposits.
;;
;; Expected updates include:
;; - Increased pool balance
;; - Updated participant count
;; - Active contribution records
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot get-pot-details)

;; Retrieves all registered participants and contribution data.
;;
;; Used to verify contribution persistence before cancellation.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot get-pot-participants)
```

---

# BLOCKCHAIN CYCLE ADVANCEMENT

```clarity
;; Advances the simulated Bitcoin burn chain by 2400 blocks.
;;
;; Unlike Scenario 1, no delegation or jackpot activation
;; occurs before the cycle advancement.
;;
;; This simulates an inactive or abandoned jackpot lifecycle
;; where no stacking execution was performed within the required window.
;;
;; Advancing the chain beyond the expected operational cycle
;; makes the pot eligible for cancellation.
::advance_burn_chain_tip 2400
```

---

# POT CANCELLATION

```clarity
::set_tx_sender ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0

;; Cancels the inactive jackpot pot after the required
;; cycle expiration period has passed.
;;
;; Expected contract operations:
;; - Verify cancellation eligibility
;; - Ensure no active delegation/jackpot exists
;; - Transition pot into cancelled state
;; - Unlock participant funds for recovery/claim
;;
;; This validates the protocol’s fail-safe mechanism
;; for inactive or abandoned jackpot executions.
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot cancel-pot 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot)
```

---

# PARTICIPANT REFUND / CLAIM FLOW

```clarity
::set_tx_sender ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP

;; Executes the claim/refund flow after pot cancellation.
;;
;; Since the jackpot was cancelled and never delegated,
;; this claim operation is expected to function as a
;; participant recovery/refund mechanism rather than
;; a jackpot reward payout.
;;
;; Expected validations include:
;; - Pot cancellation verification
;; - Participant eligibility verification
;; - Refund/recovery transfer execution
;; - Claim state updates
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot claim-pot-reward 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot)

;; Retrieves final pot state after cancellation
;; and participant claim/refund execution.
;;
;; Expected updates may include:
;; - Cancelled status flags
;; - Updated balances
;; - Claim/refund tracking state
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot get-pot-details)

;; Retrieves participant records after refund/claim execution.
;;
;; Used to verify:
;; - Participant state integrity
;; - Refund completion tracking
;; - Final participant registry consistency
(contract-call? 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.stackspot-jackpot get-pot-participants)
```

---

# END