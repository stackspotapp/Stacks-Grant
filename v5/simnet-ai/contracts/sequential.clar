;; title: sequential
;; version: 1.0.0
;; summary: Stackspots Sequential pot (simnet / PoX-5)
;; description: Round-robin payouts via next-payment-id. Staking + payouts happen on this contract.

;; --- Traits
(impl-trait .stackspot-pots-trait.stackspot-pots-trait)
(use-trait stackspot-pots-trait .stackspot-pots-trait.stackspot-pots-trait)
(use-trait stackspot-sponsor-trait .stackspot-sponsor-trait.stackspot-sponsor-trait)

;; Errors
(define-constant ERR_NOT_FOUND (err u1001))
(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant ERR_ADMIN_ONLY (err u1102))
(define-constant ERR_DUPLICATE_PARTICIPANT (err u1104))
(define-constant ERR_DUPLICATE_SPONSOR (err u1105))
(define-constant ERR_INVALID_ARGUMENT_VALUE (err u1202))
(define-constant ERR_INSUFFICIENT_AMOUNT (err u1302))
(define-constant ERR_INSUFFICIENT_POT_REWARD (err u1304))
(define-constant ERR_POT_JOIN_CLOSED (err u1401))
(define-constant ERR_POT_CLAIM_NOT_REACHED (err u1402))
(define-constant ERR_POT_ALREADY_STARTED (err u1403))
(define-constant ERR_POT_CANCELLED (err u1404))
(define-constant ERR_MAX_PARTICIPANTS_REACHED (err u1405))
(define-constant ERR_MAX_SPONSORS_REACHED (err u1406))
(define-constant ERR_POT_JOIN_FAILED (err u1408))
(define-constant ERR_TOO_EARLY (err u1409))
(define-constant ERR_INSUFFICIENT_REWARD (err u1410))
(define-constant ERR_ALREADY_INIT (err u1411))
(define-constant ERR_NOT_INITIATED (err u1412))
(define-constant ERR_POT_SESSION_ENDED (err u1413))
(define-constant ERR_POT_NOT_STARTED (err u1414))

(define-constant JOIN_POT_MEMO (unwrap-panic (to-consensus-buff? "join pot")))
(define-constant JOIN_POT_AS_SPONSOR_MEMO (unwrap-panic (to-consensus-buff? "join pot as sponsor")))

;; Widen a consensus-serialized event to `.stackspots` `(buff 2048)` logs.
(define-private (to-stackspots-buff (blob (buff 2048)))
  blob
)



;; Pot Starter Principal
;; Pot Claimer Principal
(define-data-var pot-starter-principal (optional principal) none)
(define-data-var pot-claimer-principal (optional principal) none)
(define-data-var winners-values (optional {
  winner-id: uint,
  winner-address: principal,
}) none)

;; Pot Participants Maps
(define-map pot-participants-by-principal principal uint)
(define-map pot-participants-by-id uint {participant: principal, amount: uint})

;; Sponsors Maps
(define-map sponsors-by-principal principal uint)
(define-map sponsors-by-id uint {participant: principal, amount: uint})

;; Locking Mechanism To Prevent Participants From Trying To Join The Pot While The Pot Is Stacked In Pool
(define-data-var locked bool false)
(define-data-var lock-burn-height (optional uint) none)
(define-data-var pot-cancelled bool false)
(define-data-var first-user-joined (optional uint) none)
(define-data-var next-payment-id uint u0)
(define-data-var pot-session-ended bool false)

;; Get PoX Info and return pool config
(define-constant pox-data (contract-call? .sim-pox-5 get-pox-info))
(define-constant pox-details (unwrap! pox-data ERR_NOT_FOUND))
(define-constant MORE_THAN_ONE_CYCLE (+ (get prepare-cycle-length pox-details) (get reward-cycle-length pox-details)))

(define-read-only (get-pool-config)
  (let (
      (first (get first-burnchain-block-height pox-details))
      (cycle-len (get reward-cycle-length pox-details))
      (prepare-len (get prepare-cycle-length pox-details))
      (cycle (/ (- (default-to burn-block-height (var-get lock-burn-height)) first) cycle-len))
      ;; Next reward-cycle boundary after lock (join / prepare window)
      (next-cycle-start (+ first (* (+ cycle u1) cycle-len)))
      ;; PoX-5 unlock height = start of cycle (lock-cycle + 1 + staked-cycles)
      (n (if (is-eq (var-get staked-cycles) u0) u1 (var-get staked-cycles)))
      ;; Sequential pays one winner per reward-cycle. After start, do not wait for
      ;; the full remaining stake term: first claim uses a 1-cycle window, later
      ;; claims open at the next cycle boundary + 432 (lock-burn-height resets).
      (claim-cycles (if (not (var-get locked))
        n
        (if (is-eq (var-get next-payment-id) u0) u1 u0)))
      (unlock-cycle-start (+ first (* (+ cycle u1 claim-cycles) cycle-len)))
    )
    (ok {
      join-end: (- (- next-cycle-start prepare-len) u300),
      prepare-start: (- next-cycle-start prepare-len),
      cycle-end: unlock-cycle-start,
      reward-release: (+ unlock-cycle-start u432),
    })
  )
)

;; Original PoX unlock burn height from the initial stake (first-reward-cycle + defined pot-cycle).
;; Not keyed off lock-burn-height, which resets on each sequential claim.
(define-read-only (get-defined-unlock-burn-height)
  (let (
      (first (get first-burnchain-block-height pox-details))
      (cycle-len (get reward-cycle-length pox-details))
      (unlock-cycle (+ (var-get first-reward-cycle) (var-get pot-cycle)))
    )
    (+ first (* unlock-cycle cycle-len))
  )
)

;; True when the treasury still has STX locked at the node (not the pot `locked` flag).
(define-read-only (is-treasury-funds-locked)
  (> (get locked (stx-account current-contract)) u0)
)

;; True once the defined stake term plus one extra cycle have elapsed and funds are still locked.
(define-read-only (validate-can-fall-back-cancel)
  (and
    (is-treasury-funds-locked)
    (not (var-get pot-session-ended))
    (> burn-block-height (+ (get-defined-unlock-burn-height) MORE_THAN_ONE_CYCLE))
  )
)

;; Pot Join Start validation
(define-read-only (validate-can-join-pot)
  (not (var-get locked))
)

;; Pot Claim Start validation
(define-read-only (validate-can-claim-pot)
  (let (
      (pool-config (unwrap! (get-pool-config) false))
      (reward-release (get reward-release pool-config))
    )
    (asserts! (> burn-block-height reward-release) false)
  )
)

;; This function validates that the reward covers the pot deployment fees`
(define-read-only (validate-pot-value-target-is-met)
  (>= (var-get total-pot-value)
    (* (var-get pot-min-amount) (var-get pot-max-participants))
  )
)

(define-read-only (is-locked)
  (var-get locked)
)

(define-read-only (get-pot-details)
  (ok {
    pot-participants-count: (var-get last-participant),
    pot-value: (var-get total-pot-value),
    pot-reward-amount: (unwrap! (contract-call? .sbtc-token get-balance pot-treasury-address) ERR_NOT_FOUND),
    pot-participant-values: (get-pot-participant-values tx-sender),
    ;; Winner Values
    winners-values: (var-get winners-values),
    ;; Starter Values
    pot-starter-address: (var-get pot-starter-principal),
    ;; Claimer Values
    pot-claimer-address: (var-get pot-claimer-principal),
    pool-config: (unwrap! (get-pool-config) ERR_NOT_FOUND),
    pot-locked: (var-get locked),
    pot-lock-burn-height: (default-to burn-block-height (var-get lock-burn-height)),
    pot-cancelled: (var-get pot-cancelled),
    is-joined: (map-get? pot-participants-by-principal tx-sender),
  })
)

;; Total Max Participants
;; Platform Address
;; Pot Treasury Address
(define-constant PLATFORM_ADDRESS (contract-call? .stackspots get-platform-treasury))

(define-constant pot-treasury-address current-contract)
(define-read-only (get-pot-treasury)
  (ok pot-treasury-address)
)

;; Pot Admin
(define-constant POT_ADMIN tx-sender)
(define-read-only (get-pot-admin)
  (ok POT_ADMIN)
)

;; ---------------------------------------------------------------------------
;; PoX-5 staking + Fastpool reward pull (replaces stackspots-distribute)
;; ---------------------------------------------------------------------------
(define-constant ERR_WINNER_NOT_SET (err u1305))
;; Fastpool: "A staker tried to claim rewards, but they had none available"
(define-constant FASTPOOL_ERR_NO_CLAIMABLE_REWARDS u1001)
;; PoX-5: distribution already computed for this window
(define-constant POX5_ERR_DISTRIBUTION_ALREADY_COMPUTED u30)

;; Track PoX-5 stake metadata for claim timing / reward attribution
(define-data-var staked-cycles uint u0)
(define-data-var first-reward-cycle uint u0)
(define-data-var next-reward-cycle uint u0)

(define-private (return-participant-principals (participant-value (optional {participant: principal, amount: uint})) (result (response bool uint)))
  (let (
      (participant (unwrap! (get participant participant-value) ERR_NOT_FOUND))
      (principal-amount (unwrap! (get amount participant-value) ERR_NOT_FOUND))
    )
    (try! (stx-transfer-memo? principal-amount tx-sender participant (unwrap! (to-consensus-buff? "participant principal") ERR_NOT_FOUND)))
    result
  )
)

(define-private (dispatch-principals)
  (let (
      (participants (unwrap! (get-pot-participants) ERR_NOT_FOUND))
    )
    (try! (fold return-participant-principals participants (ok true)))
    (ok true)
  )
)

(define-private (dispatch-sponsor-principals)
  (let (
      (sponsors-addresses (unwrap! (get-sponsors-addresses) ERR_NOT_FOUND))
    )
    (try! (fold return-participant-principals sponsors-addresses (ok true)))
    (ok true)
  )
)

(define-private (dispatch-rewards-with-sbtc (amount uint) (from principal) (to principal) (memo (optional (buff 32))))
  (contract-call? .sbtc-token transfer amount from to memo)
)

;; Split pot sBTC yield: 1% platform, 5% pot owner, 2% starter, 2% claimer, rest winner
(define-private (dispatch-rewards)
  (let (
      (pot-yield (unwrap! (contract-call? .sbtc-token get-balance current-contract) ERR_NOT_FOUND))
      (pot-fee (/ (* pot-yield u5) u100))
      (platform-royalty-reward (/ (* pot-yield u1) u100))
      (pot-starter-address (unwrap! (var-get pot-starter-principal) ERR_NOT_FOUND))
      (pot-starter-reward (/ (* pot-yield u2) u100))
      (claimer-address (unwrap! (var-get pot-claimer-principal) ERR_NOT_FOUND))
      (claimer-reward (/ (* pot-yield u2) u100))
      (winner-address (unwrap! (get winner-address (var-get winners-values)) ERR_WINNER_NOT_SET))
      (winner-reward (- pot-yield platform-royalty-reward pot-fee pot-starter-reward claimer-reward))
    )
    (asserts! (> pot-yield u0) ERR_INSUFFICIENT_POT_REWARD)

    (and
      (> platform-royalty-reward u0)
      (try! (dispatch-rewards-with-sbtc platform-royalty-reward current-contract PLATFORM_ADDRESS (to-consensus-buff? "platform royalty reward")))
    )
    (and
      (> pot-fee u0)
      (try! (dispatch-rewards-with-sbtc pot-fee current-contract POT_ADMIN (to-consensus-buff? "pot fee reward")))
    )
    (and
      (> pot-starter-reward u0)
      (try! (dispatch-rewards-with-sbtc pot-starter-reward current-contract pot-starter-address (to-consensus-buff? "pot starter reward")))
    )
    (and
      (> claimer-reward u0)
      (try! (dispatch-rewards-with-sbtc claimer-reward current-contract claimer-address (to-consensus-buff? "claimer reward")))
    )
    (and
      (> winner-reward u0)
      (try! (dispatch-rewards-with-sbtc winner-reward current-contract winner-address (to-consensus-buff? "winner reward")))
    )
    
    (ok true)
  )
)

;; Pay out sBTC only when the treasury holds some. Sets claimer + next unpaid winner if needed.
(define-private (dispatch-rewards-if-any)
  (let (
      (pot-yield (unwrap! (contract-call? .sbtc-token get-balance current-contract) ERR_NOT_FOUND))
    )
    (if (is-eq pot-yield u0)
      (ok true)
      (let (
          (winner-id (if (< (var-get next-payment-id) (var-get last-participant))
            (var-get next-payment-id)
            (- (var-get last-participant) u1)
          ))
          (winner-values (unwrap! (map-get? pot-participants-by-id winner-id) ERR_NOT_FOUND))
        )
        (var-set pot-claimer-principal (some tx-sender))
        (var-set winners-values (some {
          winner-id: winner-id,
          winner-address: (get participant winner-values),
        }))
        (try!
          (as-contract? ((with-ft .sbtc-token "sbtc-token" pot-yield))
            (try! (dispatch-rewards))
          )
        )
        (ok true)
      )
    )
  )
)

;; Return STX principals when the treasury's unlocked balance covers the pot.
(define-private (dispatch-principals-if-unlocked)
  (if (>= (get unlocked (stx-account current-contract)) (var-get total-pot-value))
    (begin
      (try!
        (as-contract? ((with-stx (- (var-get total-pot-value) (var-get sponsor-amount))))
          (try! (dispatch-principals))
        )
      )
      (try!
        (as-contract? ((with-stx (var-get sponsor-amount)))
          (try! (dispatch-sponsor-principals))
        )
      )
      (ok true)
    )
    (ok false)
  )
)

;; Stake pot treasury STX into PoX-5 via Fastpool (signer-calldata none = direct sBTC payouts)
(define-private (stake-treasury (cycles uint))
  (let (
      (amount-ustx (var-get total-pot-value))
      (stake-result (try! (contract-call? .sim-pox-5 stake .fastpool amount-ustx cycles burn-block-height none)))
      (first-cycle (get first-reward-cycle stake-result))
    )
    (var-set staked-cycles cycles)
    (var-set first-reward-cycle first-cycle)
    (var-set next-reward-cycle first-cycle)
    (print {
      event: "stake-treasury",
      amount-ustx: amount-ustx,
      cycles: cycles,
      first-reward-cycle: first-cycle,
      unlock-cycle: (get unlock-cycle stake-result),
    })
    (ok true)
  )
)

;; Extend stake by one cycle (sequential pots). Caller must wrap with with-staking.
;; Keep staked-cycles at 1 so get-pool-config (keyed off lock-burn-height reset) stays correct.
(define-private (extend-stake)
  (begin
    (try! (contract-call? .sim-pox-5 stake-update .fastpool .fastpool u1 u0 none))
    (var-set staked-cycles u1)
    (print {
      event: "extend-stake",
      staked-cycles: (var-get staked-cycles),
      next-reward-cycle: (var-get next-reward-cycle),
    })
    (ok true)
  )
)

;; Schedule unlock at the next cycle boundary
(define-private (revoke-stake)
  (begin
    (try! (contract-call? .sim-pox-5 unstake .fastpool))
    (print { event: "revoke-stake" })
    (ok true)
  )
)

;; Accrue RPT for the current distribution window (ignore if already computed)
(define-private (ensure-rewards-calculated)
  (match (contract-call? .sim-pox-5 calculate-rewards (list))
    success (ok true)
    err-code
      (if (is-eq err-code POX5_ERR_DISTRIBUTION_ALREADY_COMPUTED)
        (ok true)
        (err err-code)
      )
  )
)

;; Crystallize Fastpool's STX-only bucket for a reward-cycle if empty.
;; Soft-fail when pox-5 / Fastpool report nothing claimable yet.
(define-private (ensure-fastpool-crystallized (reward-cycle uint))
  (if (is-eq (contract-call? .fastpool get-unclaimed-rewards-for-cycle reward-cycle none) u0)
    (match (contract-call? .fastpool claim-rewards (list) reward-cycle)
      success (ok true)
      err-code
        (if (or (is-eq err-code FASTPOOL_ERR_NO_CLAIMABLE_REWARDS) (is-eq err-code u32))
          (ok true)
          (err err-code)
        )
    )
    (ok true)
  )
)

;; Pull one reward-cycle of sBTC from Fastpool onto this pot (the staker).
;; Returns amount paid (0 if Fastpool reports nothing claimable).
(define-private (pull-staking-rewards-cycle (reward-cycle uint))
  (begin
    (try! (ensure-rewards-calculated))
    (try! (ensure-fastpool-crystallized reward-cycle))
    (match (contract-call? .fastpool settle-staker-rewards current-contract reward-cycle none)
      earned
        (let (
            (payout-result (try! (contract-call? .fastpool payout current-contract)))
            (paid (get amount payout-result))
          )
          (print {
            event: "pull-staking-rewards-cycle",
            reward-cycle: reward-cycle,
            earned: earned,
            paid: paid,
            withdrawal-request: (get withdrawal-request payout-result),
          })
          (ok paid)
        )
      err-code
        (if (is-eq err-code FASTPOOL_ERR_NO_CLAIMABLE_REWARDS)
          (begin
            (print {
              event: "pull-staking-rewards-cycle",
              reward-cycle: reward-cycle,
              earned: u0,
              paid: u0,
            })
            (ok u0)
          )
          (err err-code)
        )
    )
  )
)

;; Pull the next attributed reward-cycle onto this pot, then advance the cursor
(define-private (pull-next-staking-rewards)
  (let (
      (reward-cycle (var-get next-reward-cycle))
      (paid (try! (pull-staking-rewards-cycle reward-cycle)))
    )
    (var-set next-reward-cycle (+ reward-cycle u1))
    (ok paid)
  )
)

;; Pull every remaining defined reward-cycle onto this pot (fall-back unwind)
(define-private (pull-remaining-cycle-offset (offset uint) (prior (response uint uint)))
  (match prior
    total
      (match (pull-staking-rewards-cycle (+ (var-get next-reward-cycle) offset))
        earned (ok (+ total earned))
        err-code (err err-code)
      )
    err-code (err err-code)
  )
)

(define-private (pull-remaining-staking-rewards)
  (let (
      (end-cycle (+ (var-get first-reward-cycle) (var-get pot-cycle)))
      (start (var-get next-reward-cycle))
      (count (if (>= start end-cycle) u0 (- end-cycle start)))
      (offsets (unwrap! (contract-call? .stackspot-vrf generate-list u0 count) ERR_NOT_FOUND))
      (total (try! (fold pull-remaining-cycle-offset offsets (ok u0))))
    )
    (var-set next-reward-cycle (+ start count))
    (ok total)
  )
)

;; Permissionless keeper entry: crystallize + settle + payout one cycle onto this pot
(define-public (pull-staking-rewards (reward-cycle uint))
  (ok (try! (pull-staking-rewards-cycle reward-cycle)))
)

(define-read-only (get-staking-meta)
  {
    staked-cycles: (var-get staked-cycles),
    first-reward-cycle: (var-get first-reward-cycle),
    next-reward-cycle: (var-get next-reward-cycle),
    staker-info: (contract-call? .sim-pox-5 get-staker-info current-contract),
  }
)


;; Last Participant Indexed In The Pot Participants By Id Map
(define-data-var last-participant uint u0)
(define-read-only (get-last-participant)
  (ok (var-get last-participant))
)

(define-read-only (get-configs)
  {
    cycles: (var-get pot-cycle),
    min-amount: (var-get pot-min-amount),
    max-participants: (var-get pot-max-participants),
  }
)

;; Pot Value
(define-data-var total-pot-value uint u0)
(define-read-only (get-pot-value)
  (ok (var-get total-pot-value))
)

;; Increment Pot Value
(define-private (add-pot-value (amount uint))
  (var-set total-pot-value (+ (var-get total-pot-value) amount))
)
;; Read-Only public function that gets participant by index
(define-read-only (get-by-id-helper (n uint))
  (ok (map-get? pot-participants-by-id n))
)
(define-read-only (get-by-id-helper-private (n uint))
  (map-get? pot-participants-by-id n)
)
(define-data-var last-sponsors-count uint u0)
(define-read-only (get-by-id-helper-sponsor (n uint))
  (map-get? sponsors-by-id n)
)

(define-read-only (get-pot-participant-values (participant principal))
  (map-get? pot-participants-by-id
    (default-to u0 (map-get? pot-participants-by-principal participant))
  )
)

;; Read-Only public function that gets all participants
(define-read-only (get-pot-participants)
  (let (
      (participants-count (var-get last-participant))
      (n (contract-call? .stackspot-vrf generate-list u0 participants-count)) 
      (participants (match n
        value (map get-by-id-helper-private value)
        (list)
      ))
    )
    (ok participants)
  )
)

;; Read-Only public function that gets all participants
(define-read-only (get-sponsors-addresses)
  (let 
    (
      (n (contract-call? .stackspot-vrf generate-list u0 (var-get last-sponsors-count)))
      (participants 
        (match n
          value (map get-by-id-helper-sponsor value)
          (list)
        )
      )
    )
    (ok participants)
  )
)

;; Get Pot ID
(define-read-only (get-pot-id)
  (contract-call? .stackspots get-token-id pot-treasury-address)
)

;; Get Pot Starter Principal
(define-read-only (get-pot-starter-principal)
  (ok (var-get pot-starter-principal))
)

;; Get Pot Claimer Principal
(define-read-only (get-pot-claimer-principal)
  (ok (var-get pot-claimer-principal))
)

;; Private helper function that delegates to pot-treasury
(define-private (delegate-to-pot (amount uint) (participant principal))
  (let (
      (index-participants (var-get last-participant))
      (pot-config (get-configs))
      (max-participants (get max-participants pot-config))
      (min-amount (get min-amount pot-config))
    )
    ;; Participants Eligibility Validations
    (asserts! (>= amount min-amount) ERR_INSUFFICIENT_AMOUNT)

    (asserts! (not (is-eq participant pot-treasury-address)) ERR_UNAUTHORIZED)
    (asserts! (not (is-eq participant PLATFORM_ADDRESS)) ERR_UNAUTHORIZED)
    (asserts! (not (is-eq participant POT_ADMIN)) ERR_UNAUTHORIZED)
    (asserts! (not (var-get pot-cancelled)) ERR_POT_CANCELLED)

    (asserts! (is-none (map-get? pot-participants-by-principal participant)) ERR_DUPLICATE_PARTICIPANT)

    ;; Registers Participants Values To The Pot Maps
    (map-insert pot-participants-by-principal participant index-participants)
    (map-insert pot-participants-by-id index-participants {participant: participant, amount: amount})

    ;; Transfers User's Delegated Amount To Pot Treasury
    (try! (stx-transfer-memo? amount participant pot-treasury-address JOIN_POT_MEMO))

    ;; Updates Pot Value
    (add-pot-value amount)

    ;; Updates Last Participant To Next Pot Joiner
    (var-set last-participant (+ index-participants u1))

    ;; Updates Pot Cycle
    (if (> (var-get last-participant) u1) 
      (begin (var-set pot-cycle (+ (var-get pot-cycle) u1)) true)
      false    
    )

    ;; Action Log (pot + stackspots)
    (let (
        (payload (to-stackspots-buff (unwrap! (as-max-len? (unwrap! (to-consensus-buff? {
          event: "join-pot",
          participant: participant,
          amount: amount,
          index: index-participants,
        }) ERR_NOT_FOUND) u2048) ERR_NOT_FOUND)))
      )
      (print payload)
      (try! (contract-call? .stackspots log-join-pot payload))
    )

    ;; Execution Complete
    (ok true)
  )
)

;; Public Function That Initiates The Payments
(define-public (join-pot (amount uint))
  (begin
    ;; Validate can join pot
    ;; Validate amount is greater than 0
    ;; Validate participant is the same as the tx sender
    ;; Delegate to pot
    (asserts! (var-get initiated) ERR_NOT_INITIATED)
    (asserts! (validate-can-join-pot) ERR_POT_JOIN_CLOSED)
    (asserts! (<= (var-get last-participant) (- (var-get pot-max-participants) u1)) ERR_MAX_PARTICIPANTS_REACHED)

    (try! (delegate-to-pot amount tx-sender))
    ;; Set first user joined burn height
    (and
      (is-none (var-get first-user-joined))
      (var-set first-user-joined (print (some burn-block-height)))
    )
    (ok true)
  )
)

(define-data-var sponsor-amount uint u0)
(define-public (join-pot-as-sponsor (amount uint) (sponsor principal))
  (begin
    ;; Validate can delegate to sponsor
    ;; Validate amount is greater than 0
    ;; Validate sponsor is the same as the tx sender
    ;; Delegate to sponsor
    (asserts! (> amount u0) ERR_INSUFFICIENT_AMOUNT)

    (asserts! (var-get initiated) ERR_NOT_INITIATED)
    (asserts! (validate-can-join-pot) ERR_POT_JOIN_CLOSED)
    (asserts! (not (is-eq sponsor current-contract)) ERR_UNAUTHORIZED)
    (asserts! (not (is-eq sponsor PLATFORM_ADDRESS)) ERR_UNAUTHORIZED)
    (asserts! (not (is-eq sponsor POT_ADMIN)) ERR_UNAUTHORIZED)
    (asserts! (not (var-get pot-cancelled)) ERR_POT_CANCELLED)

    (asserts! (<= (var-get last-sponsors-count) u99) ERR_MAX_SPONSORS_REACHED)
    (asserts! (is-none (map-get? sponsors-by-principal sponsor)) ERR_DUPLICATE_SPONSOR)

    ;; Registers Sponsors Values To The Sponsors Maps
    (map-insert sponsors-by-principal sponsor (var-get last-sponsors-count))
    (map-insert sponsors-by-id (var-get last-sponsors-count) {participant: sponsor, amount: amount})

    ;; Transfers Sponsor's Amount To Pot Treasury
    (try! (stx-transfer-memo? amount sponsor current-contract JOIN_POT_AS_SPONSOR_MEMO))

    ;; Updates Pot Value
    (add-pot-value amount)

    ;; Updates Sponsor Amount
    (var-set sponsor-amount (+ (var-get sponsor-amount) amount))

    ;; Updates Last Sponsor To Next Sponsor Joiner
    (var-set last-sponsors-count (+ (var-get last-sponsors-count) u1))

    ;; Action Log (pot + stackspots)
    (let (
        (payload (to-stackspots-buff (unwrap! (as-max-len? (unwrap! (to-consensus-buff? {
          event: "join-pot-as-sponsor",
          sponsor: sponsor,
          amount: amount,
          sponsors-count: (var-get last-sponsors-count),
        }) ERR_NOT_FOUND) u2048) ERR_NOT_FOUND)))
      )
      (print payload)
      (try! (contract-call? .stackspots log-join-pot-as-sponsor payload))
    )

    ;; Execution Complete
    (ok true)
  )
)

(define-public (cancel-pot (pot-contract <stackspot-pots-trait>))
  (begin
    (asserts! (not (var-get locked)) ERR_POT_ALREADY_STARTED)
    (asserts! (> burn-block-height (+ (default-to burn-block-height (var-get first-user-joined)) MORE_THAN_ONE_CYCLE)) ERR_TOO_EARLY)
    (asserts! (is-eq (contract-of pot-contract) current-contract) ERR_ADMIN_ONLY)

    ;; Returns participants principals
    (try! 
      (as-contract? ((with-stx (- (var-get total-pot-value) (var-get sponsor-amount))))
        (try! (dispatch-principals))
      )
    )

    ;; Returns sponsors principals
    (try! 
      (as-contract? ((with-stx (var-get sponsor-amount)))
        (try! (dispatch-sponsor-principals))
      )
    )

    ;; Set pot cancelled to true
    (var-set pot-cancelled true)

    ;; Action Log (pot + stackspots)
    (let (
        (payload (to-stackspots-buff (unwrap! (as-max-len? (unwrap! (to-consensus-buff? {
          event: "cancel-pot",
          pot-cancelled: (var-get pot-cancelled),
          pot-value: (var-get total-pot-value),
          pot-participants-count: (var-get last-participant),
        }) ERR_NOT_FOUND) u2048) ERR_NOT_FOUND)))
      )
      (print payload)
      (try! (contract-call? .stackspots log-cancel-pot payload))
    )

    ;; Execution complete
    (ok true)
  )
)

;; Unwind a sequential pot that finished its defined stake term but is still locked
;; more than one extra cycle later (claims never completed). Revokes any remaining
;; PoX lock, returns STX principals when unlocked, and pays sBTC if any is on hand.
(define-public (fall-back-cancel (pot-contract <stackspot-pots-trait>))
  (begin
    (asserts! (var-get initiated) ERR_NOT_INITIATED)
    (asserts! (is-treasury-funds-locked) ERR_POT_NOT_STARTED)
    (asserts! (not (var-get pot-session-ended)) ERR_POT_SESSION_ENDED)
    (asserts! (is-eq (contract-of pot-contract) current-contract) ERR_UNAUTHORIZED)
    (asserts! (> (var-get last-participant) u0) ERR_NOT_FOUND)
    ;; Defined cycle length reached, and still locked more than one extra cycle
    (asserts! (validate-can-fall-back-cancel) ERR_TOO_EARLY)

    ;; Block further claims while this unwind is in progress / complete
    (var-set pot-cancelled true)

    ;; Pull any remaining Fastpool sBTC for the defined stake term
    (try! (pull-remaining-staking-rewards))

    ;; Schedule unlock at the next cycle boundary if still actively staking
    (if (is-some (contract-call? .sim-pox-5 get-staker-info current-contract))
      (begin
        (try! (as-contract? ()
          (try! (revoke-stake))
        ))
        true
      )
      false
    )

    ;; Return STX principals when the treasury is unlocked
    (let (
        (principals-returned (try! (dispatch-principals-if-unlocked)))
      )
      ;; Disburse sBTC rewards if any are available
      (try! (dispatch-rewards-if-any))

      (and principals-returned (var-set pot-session-ended true))

      (print (to-consensus-buff? {
        event: "fall-back-cancel",
        pot-cancelled: (var-get pot-cancelled),
        pot-session-ended: (var-get pot-session-ended),
        principals-returned: principals-returned,
        pot-locked: (var-get locked),
        defined-unlock-burn-height: (get-defined-unlock-burn-height),
      }))
      (try! (contract-call? .stackspots log-fall-back-cancel
        (to-stackspots-buff (unwrap! (as-max-len? (unwrap! (to-consensus-buff? {
          event: "fall-back-cancel",
          pot-cancelled: (var-get pot-cancelled),
          pot-session-ended: (var-get pot-session-ended),
          principals-returned: principals-returned,
          pot-locked: (var-get locked),
          pot-value: (var-get total-pot-value),
          pot-participants-count: (var-get last-participant),
          defined-unlock-burn-height: (get-defined-unlock-burn-height),
        }) ERR_NOT_FOUND) u2048) ERR_NOT_FOUND))))

      (ok true)
    )
  )
)

;; Public Function That Starts The Jackpot
(define-public (start-stackspot-sequential-pot (pot-contract <stackspot-pots-trait>))
  (begin
    ;; Validates pot is not already started
    (asserts! (not (var-get locked)) ERR_POT_ALREADY_STARTED)
    ;; Validate pot value target is met
    (asserts! (validate-pot-value-target-is-met) ERR_INSUFFICIENT_REWARD)
    ;; Validate pot is not cancelled
    (asserts! (not (var-get pot-cancelled)) ERR_POT_CANCELLED)
    ;; Validate pot treasury is the same as the pot contract
    (asserts! (is-eq pot-treasury-address (contract-of pot-contract)) ERR_UNAUTHORIZED)

    ;; Set lock burn height
    (var-set lock-burn-height (some burn-block-height))

    ;; Stake treasury into PoX-5 via Fastpool for one cycle (extend on each later claim)
    (try! (as-contract? ((with-stx (var-get total-pot-value)) (with-staking (var-get total-pot-value)))
      (try! (stake-treasury (var-get pot-cycle)))
    ))

    ;; Set pot starter principal
    (var-set pot-starter-principal (some tx-sender))

    ;; Lock pot
    (var-set locked true)

    ;; Print
    (print (to-consensus-buff? {
      event: "start-stackspot-sequential-pot",
      pot-starter-principal: tx-sender,
      pot-contract: (contract-of pot-contract),
      pot-treasury: pot-treasury-address,
      pot-participants: (unwrap! (get-pot-participants) ERR_NOT_FOUND),
      pot-value: (var-get total-pot-value),
      pot-locked: (var-get locked),
      pot-lock-burn-height: (default-to burn-block-height (var-get lock-burn-height)),
      pot-cancelled: (var-get pot-cancelled),
    }))

    ;; Execution complete
    (ok true)
  )
)

;; Public function that rewards the pot winner, returns participants principals and rewards pot starter and claimer
(define-public (claim-pot-reward (pot-contract <stackspot-pots-trait>) (sponsors (list 5 <stackspot-sponsor-trait>)))
  (begin
    ;; Validate pot is not cancelled
    ;; Validate can claim pot
    (asserts! (not (var-get pot-cancelled)) ERR_POT_CANCELLED)
    (asserts! (validate-can-claim-pot) ERR_POT_CLAIM_NOT_REACHED)
    (asserts! (is-eq pot-treasury-address (contract-of pot-contract)) ERR_UNAUTHORIZED)

    ;; Pull the next Fastpool reward-cycle onto this pot
    (try! (pull-next-staking-rewards))
    ;; Pull platform-sponsor sBTC onto this pot before STX/sBTC distributions
    (try! (claim-platform-sponsor-rewards sponsors pot-contract))

    (let (
        ;; Get pot details
        (pot-details (unwrap! (get-pot-details) (err u999)))
        ;; @value: pot ID
        ;; @value: pot winner's ID
        ;; @value: pot winner's {participant: principal, amount: uint}
        ;; @value: pot winner's principal
        ;; @value: pot winner's reward
        (pot-id (get-pot-id))
        (total-participants (get pot-participants-count pot-details))
        (participants (unwrap! (get-pot-participants) (err u998))) ;; Get participants list
        (pot-yield (unwrap! (contract-call? .sbtc-token get-balance pot-treasury-address) (err u997)))
        ;; Get stacked reward
        (pot-starter (get pot-starter-address pot-details))
        (pot-starter-reward (if (> pot-yield u0) (* (/ pot-yield u100) u2) u0))
        ;; Calculate pot starter's reward
        (claimer tx-sender) ;; Calculate claimer's reward
        (claimer-reward (if (> pot-yield u0) (* (/ pot-yield u100) u2) u0))
        (pot-winner-id (var-get next-payment-id))
        (winner-values (unwrap! (map-get? pot-participants-by-id pot-winner-id) (err u995)))
        (winner (get participant winner-values))
      )
      ;; Validate pot yield is greater than 0
      (asserts! (> pot-yield u0) ERR_INSUFFICIENT_POT_REWARD)

      ;; Set pot claimer principal
      (var-set pot-claimer-principal (some tx-sender))

      ;; Set winners address
      (var-set winners-values (some {winner-id: pot-winner-id, winner-address: winner}))

      (if (not (var-get pot-session-ended))       
        (if (is-eq (+ (var-get next-payment-id) u1) total-participants)
          ;; Last sequential winner: return STX principals + disburse sBTC
          (begin
            ;; Returns participants principals
            (try! 
              (as-contract? ((with-stx (- (var-get total-pot-value) (var-get sponsor-amount))))
                (try! (dispatch-principals))
              )
            )

            ;; Returns sponsors principals
            (try! 
              (as-contract? ((with-stx (var-get sponsor-amount)))
                (try! (dispatch-sponsor-principals))
              )
            )

            ;; Disburse rewards
            (try! 
              (as-contract? ((with-ft .sbtc-token "sbtc-token" pot-yield))
                (try! (dispatch-rewards))
              )
            )

            ;; Set pot session ended to true
            (var-set pot-session-ended true)
            ;; Execution complete
            true
          )
          ;; More winners remain: pay this round
          (begin
            ;; Disburse rewards
            (try! 
              (as-contract? ((with-ft .sbtc-token "sbtc-token" pot-yield))
                (try! (dispatch-rewards))
              )
            )          

            ;; Set lock burn height for next claim window
            (var-set lock-burn-height (some burn-block-height))

            ;; Increment next payment id
            (var-set next-payment-id (+ (var-get next-payment-id) u1))

            false
          )
        )
        (begin 
            ;; Disburse rewards
            (try! 
              (as-contract? ((with-ft .sbtc-token "sbtc-token" pot-yield))
                (try! (dispatch-rewards))
              )
            )            
        )
      )

    ;; Action Log (pot + stackspots). Full participant list stays on the pot print;
    ;; the stackspots buff omits it so it fits `(buff 2048)`.
    (print (to-consensus-buff? {
      ;; Pot Values
      event: "claim-pot-reward",
      ;; Pot Round Values
      pot-participants-count: total-participants,
      pot-participants: participants,
      pot-value: (var-get total-pot-value),
      pot-yield-amount: pot-yield,
      ;; Winner Values
      winners-values: (var-get winners-values),
      ;; Starter Values
      starter-address: pot-starter,
      starter-reward-amount: pot-starter-reward,
      ;; Claimer Values
      claimer-address: claimer,
      claimer-reward-amount: claimer-reward,
      ;; Pot Values
      pot-id: pot-id,
      pot-address: pot-treasury-address,
      pot-owner: POT_ADMIN,
      ;; Pot Config Values
      pot-name: (var-get pot-name),
      pot-type: pot-type,
      pot-cycle: (var-get pot-cycle),
      pot-reward-token: "sbtc",
      pot-min-amount: (var-get pot-min-amount),
      pot-max-participants: (var-get pot-max-participants),
      ;; Pot Origination Values
      origin-contract-sha-hash: (unwrap! (contract-hash? current-contract) ERR_NOT_FOUND),
      stacks-block-height: stacks-block-height,
      burn-block-height: burn-block-height,
      lock-burn-height: (default-to burn-block-height (var-get lock-burn-height)),
      pot-cancelled: (var-get pot-cancelled),
    }))
    
    (try! (contract-call? .stackspots log-claim-pot-reward
      (to-stackspots-buff (unwrap! (as-max-len? (unwrap! (to-consensus-buff? {
        event: "claim-pot-reward",
        pot-participants-count: total-participants,
        pot-value: (var-get total-pot-value),
        pot-yield-amount: pot-yield,
        winners-values: (var-get winners-values),
        starter-address: pot-starter,
        starter-reward-amount: pot-starter-reward,
        claimer-address: claimer,
        claimer-reward-amount: claimer-reward,
        pot-id: pot-id,
        pot-address: pot-treasury-address,
        pot-owner: POT_ADMIN,
        pot-name: (var-get pot-name),
        pot-type: pot-type,
        pot-cycle: (var-get pot-cycle),
        pot-reward-token: "sbtc",
        pot-min-amount: (var-get pot-min-amount),
        pot-max-participants: (var-get pot-max-participants),
        origin-contract-sha-hash: (unwrap! (contract-hash? current-contract) ERR_NOT_FOUND),
        stacks-block-height: stacks-block-height,
        burn-block-height: burn-block-height,
        lock-burn-height: (default-to burn-block-height (var-get lock-burn-height)),
        pot-cancelled: (var-get pot-cancelled),
      }) ERR_NOT_FOUND) u2048) ERR_NOT_FOUND))))
    ;; Execution complete
    (ok true)
    )
  )
)

(define-read-only (get-next-payment-id)
  (ok (var-get next-payment-id))
)
(define-read-only (get-pot-session-status)
  (ok (var-get pot-session-ended))
)
(define-read-only (get-pot-cycle)
  (ok (var-get last-participant))
)
(define-read-only (get-pot-min-amount)
  (ok (var-get pot-min-amount))
)
(define-read-only (get-pot-max-participants)
  (ok (var-get pot-max-participants))
)
(define-read-only (get-pot-name)
  (ok (var-get pot-name))
)
(define-read-only (get-pot-type)
  (ok pot-type)
)
(define-read-only (get-pot-origin-contract-sha-hash)
  (contract-hash? current-contract)
)
(define-read-only (get-pot-reward-token)
  (ok "sbtc")
)
(define-read-only (get-pot-is-init)
  (ok (var-get initiated))
)

;; Platform sponsor tickets (sponsor contract -> ticket-id)
(define-map platform-sponsor-tickets principal uint)
(define-read-only (get-platform-sponsor-ticket (sponsor principal))
  (ok (map-get? platform-sponsor-tickets sponsor))
)
(define-private (bind-one-platform-sponsor (sponsor <stackspot-sponsor-trait>) (pot <stackspot-pots-trait>))
  (let (
      (sponsor-contract (contract-of sponsor))
      (ticket-id (try! (contract-call? sponsor sponsor-event pot)))
    )
    (asserts! (is-none (map-get? platform-sponsor-tickets sponsor-contract)) ERR_DUPLICATE_SPONSOR)
    (map-set platform-sponsor-tickets sponsor-contract ticket-id)
    (ok {sponsor-contract: sponsor-contract, ticket-id: ticket-id})
  )
)
(define-private (bind-optional-platform-sponsor (maybe (optional <stackspot-sponsor-trait>)) (pot <stackspot-pots-trait>))
  (match maybe
    sponsor (ok (some (try! (bind-one-platform-sponsor sponsor pot))))
    (ok none)
  )
)
(define-private (push-sponsor-ticket (item (optional {sponsor-contract: principal, ticket-id: uint})) (acc (list 5 {sponsor-contract: principal, ticket-id: uint})))
  (match item
    ticket (unwrap! (as-max-len? (append acc ticket) u5) acc)
    acc
  )
)
(define-private (bind-platform-sponsors (sponsors (list 5 <stackspot-sponsor-trait>)) (pot <stackspot-pots-trait>))
  (let (
      (t0 (try! (bind-optional-platform-sponsor (element-at? sponsors u0) pot)))
      (t1 (try! (bind-optional-platform-sponsor (element-at? sponsors u1) pot)))
      (t2 (try! (bind-optional-platform-sponsor (element-at? sponsors u2) pot)))
      (t3 (try! (bind-optional-platform-sponsor (element-at? sponsors u3) pot)))
      (t4 (try! (bind-optional-platform-sponsor (element-at? sponsors u4) pot)))
    )
    (ok (fold push-sponsor-ticket (list t0 t1 t2 t3 t4) (list)))
  )
)
(define-private (claim-one-platform-sponsor (sponsor <stackspot-sponsor-trait>) (pot <stackspot-pots-trait>))
  (let (
      (ticket-id (unwrap! (map-get? platform-sponsor-tickets (contract-of sponsor)) ERR_NOT_FOUND))
    )
    (try! (contract-call? sponsor claim-sponsor-reward pot ticket-id))
    (ok true)
  )
)
(define-private (claim-sponsor-fold (sponsor <stackspot-sponsor-trait>) (state {pot: <stackspot-pots-trait>, result: (response bool uint)}))
  {
    pot: (get pot state),
    result: (match (get result state)
      ok-val (claim-one-platform-sponsor sponsor (get pot state))
      err-val (err err-val)
    )
  }
)
(define-private (claim-platform-sponsor-rewards (sponsors (list 5 <stackspot-sponsor-trait>)) (pot <stackspot-pots-trait>))
  (get result (fold claim-sponsor-fold sponsors {pot: pot, result: (ok true)}))
)

;; Pot Configuration
(define-data-var initiated bool false)
(define-public (init-pot (min-amount uint) (max-participants uint) (name (string-ascii 255)) (contract <stackspot-pots-trait>) (sponsors (list 5 <stackspot-sponsor-trait>)))
  (begin
    (asserts! (is-eq tx-sender POT_ADMIN) ERR_ADMIN_ONLY)
    (asserts! (not (var-get initiated)) ERR_ALREADY_INIT)
    (asserts! (is-eq (contract-of contract) current-contract) ERR_UNAUTHORIZED)
    (asserts! (and (>= max-participants u1) (<= max-participants u100)) ERR_INVALID_ARGUMENT_VALUE)
    
    (var-set pot-min-amount min-amount)
    (var-set pot-max-participants max-participants)
    (var-set pot-name name)
    
    (var-set initiated true)

    (let (
        (sponsor-tickets (try! (bind-platform-sponsors sponsors contract)))
        (payload (to-stackspots-buff (unwrap! (as-max-len? (unwrap! (to-consensus-buff? {
          owner: tx-sender,
          contract: current-contract,
          cycles: (var-get pot-cycle),
          type: pot-type,
          pot-reward-token: "sbtc",
          min-amount: (var-get pot-min-amount),
          max-participants: (var-get pot-max-participants),
          sponsors: sponsor-tickets,
        }) ERR_NOT_FOUND) u2048) ERR_NOT_FOUND)))
      )
      (print (to-consensus-buff? {
        event: "init-pot",
        owner: tx-sender,
        pot-admin: POT_ADMIN,
        pot-treasury: current-contract,
        contract: current-contract,
        cycles: (var-get pot-cycle),
        type: pot-type,
        pot-reward-token: "sbtc",
        min-amount: (var-get pot-min-amount),
        max-participants: (var-get pot-max-participants),
        pot-is-init: (var-get initiated),
        sponsors: sponsor-tickets,
      }))

      (contract-call? .stackspots register-pot payload contract)
    )
  )
)

(define-data-var pot-cycle uint u1)
(define-data-var pot-min-amount uint u100000000)
(define-data-var pot-max-participants uint u100)
(define-data-var pot-name (string-ascii 255) "")
(define-constant pot-type "sequential")

;; Pre init (pot + stackspots)
(define-constant PRE_INIT_LOG (to-stackspots-buff (unwrap-panic (as-max-len? (unwrap-panic (to-consensus-buff? (merge { event: "pre-init" } {
  pot-cycle: (var-get pot-cycle),
  pot-min-amount: (var-get pot-min-amount),
  pot-max-participants: (var-get pot-max-participants),
  pot-name: (var-get pot-name),
  pot-type: pot-type,
  pot-is-init: (var-get initiated),
  pot-admin: POT_ADMIN,
  pot-contract: current-contract,
  pot-owner: tx-sender,
  pot-treasury: current-contract,
  funding-address: none,
}))) u2048))))
(print PRE_INIT_LOG)
(contract-call? .stackspots log-pre-init PRE_INIT_LOG)
