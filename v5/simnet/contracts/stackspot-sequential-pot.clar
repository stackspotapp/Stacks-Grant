;; title: stackspot-jackpot
;; version:
;; summary:
;; description:

;; --- Traits
(impl-trait 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-trait.stackspot-trait)
(use-trait stackspot-trait 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-trait.stackspot-trait)

;; Errors
(define-constant ERR_NOT_FOUND (err u1001))
(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant ERR_ADMIN_ONLY (err u1102))
(define-constant ERR_DUPLICATE_PARTICIPANT (err u1104))
(define-constant ERR_INSUFFICIENT_AMOUNT (err u1302))
(define-constant ERR_INSUFFICIENT_POT_REWARD (err u1304))
(define-constant ERR_POT_JOIN_CLOSED (err u1401))
(define-constant ERR_POT_CLAIM_NOT_REACHED (err u1402))
(define-constant ERR_POT_ALREADY_STARTED (err u1403))
(define-constant ERR_POT_CANCELLED (err u1404))
(define-constant ERR_MAX_PARTICIPANTS_REACHED (err u1405))
(define-constant ERR_POT_JOIN_FAILED (err u1408))
(define-constant ERR_TOO_EARLY (err u1409))
(define-constant ERR_INSUFFICIENT_REWARD (err u1410))
(define-constant ERR_ALREADY_INIT (err u1411))
(define-constant ERR_POT_SESSION_ENDED (err u1412))

(define-constant JOIN_POT_MEMO (unwrap-panic (to-consensus-buff? "join pot")))

;; Pot Starter Principal
;; Pot Claimer Principal
(define-data-var pot-starter-principal (optional principal) none)
(define-data-var pot-claimer-principal (optional principal) none)
(define-data-var winners-values (optional {
  winner-id: uint,
  winner-address: principal,
}) none)

;; Pot Participants Maps
(define-map pot-participants-by-principal
  principal
  uint
)
(define-map pot-participants-by-id
  uint
  {
    participant: principal,
    amount: uint,
  }
)

;; Locking Mechanism To Prevent Participants From Trying To Join The Pot While The Pot Is Stacked In Pool
(define-data-var locked bool false)
(define-data-var lock-burn-height (optional uint) none)
(define-data-var pot-cancelled bool false)
(define-data-var first-user-joined (optional uint) none)
(define-data-var next-payment-id uint u1)
(define-data-var pot-session-ended bool false)

;; Get PoX Info and return pool config
(define-constant POX_DETAILS (unwrap!
  (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sim-pox-4
    get-pox-info
  )
  ERR_NOT_FOUND
))
(define-constant MORE_THAN_ONE_CYCLE (+ (get prepare-cycle-length POX_DETAILS) (get reward-cycle-length POX_DETAILS)))

(define-read-only (get-pool-config)
  (let (
      (first (get first-burnchain-block-height POX_DETAILS))
      (cycle-len (get reward-cycle-length POX_DETAILS))
      (prepare-len (get prepare-cycle-length POX_DETAILS))
      (cycle (/ (- (default-to burn-block-height (var-get lock-burn-height)) first)
        cycle-len
      ))
      (next-cycle-start (+ first (* (+ cycle (var-get next-payment-id)) cycle-len)))
    )
    (ok {
      join-end: (- (- next-cycle-start prepare-len) u300),
      prepare-start: (- next-cycle-start prepare-len),
      cycle-end: next-cycle-start,
      reward-release: (+ next-cycle-start u432),
    })
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
    pot-reward-amount: (unwrap!
      (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token
        get-balance pot-treasury-address
      )
      ERR_NOT_FOUND
    ),
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
(define-constant PLATFORM_ADDRESS (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots
  get-platform-treasury
))

(define-constant pot-treasury-address current-contract)
(define-read-only (get-pot-treasury)
  (ok pot-treasury-address)
)

;; Pot Admin
(define-constant pot-admin tx-sender)
(define-read-only (get-pot-admin)
  (ok pot-admin)
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

(define-read-only (get-pot-participant-values (participant principal))
  (map-get? pot-participants-by-id
    (default-to u0 (map-get? pot-participants-by-principal participant))
  )
)

;; Read-Only public function that gets all participants
(define-read-only (get-pot-participants)
  (let (
      (participants-count (var-get last-participant))
      (n (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-vrf
        generate-list u0 participants-count
      ))
      (participants (match n
        value (map get-by-id-helper-private value)
        (list)
      ))
    )
    (ok participants)
  )
)

;; Get Pot ID
(define-read-only (get-pot-id)
  (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots
    get-token-id pot-treasury-address
  )
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
(define-private (delegate-to-pot
    (amount uint)
    (participant principal)
  )
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
    (asserts! (not (is-eq participant pot-admin)) ERR_UNAUTHORIZED)
    (asserts! (not (var-get pot-cancelled)) ERR_POT_CANCELLED)

    (asserts! (< index-participants max-participants)
      ERR_MAX_PARTICIPANTS_REACHED
    )
    (asserts! (is-none (map-get? pot-participants-by-principal participant))
      ERR_DUPLICATE_PARTICIPANT
    )

    ;; Registers Participants Values To The Pot Maps
    (map-insert pot-participants-by-principal participant index-participants)
    (map-insert pot-participants-by-id index-participants {
      participant: participant,
      amount: amount,
    })

    ;; Transfers User's Delegated Amount To Pot Treasury
    (asserts!
      (is-ok (stx-transfer-memo? amount participant pot-treasury-address JOIN_POT_MEMO))
      ERR_POT_JOIN_FAILED
    )

    ;; Updates Pot Value
    (add-pot-value amount)

    ;; Action Log
    (print {
      event: "delegate-to-pot",
      participant: participant,
      amount: amount,
      index: index-participants,
    })

    ;; Updates Last Participant To Next Pot Joiner
    (var-set last-participant (+ index-participants u1))

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
    (asserts! (not (var-get locked)) ERR_POT_JOIN_CLOSED)
    (asserts! (> amount u0) ERR_INSUFFICIENT_AMOUNT)

    (try! (delegate-to-pot amount tx-sender))
    ;; Set first user joined burn height
    (and
      (is-none (var-get first-user-joined))
      (var-set first-user-joined (print (some burn-block-height)))
    )
    (ok true)
  )
)

(define-public (cancel-pot (pot-contract <stackspot-trait>))
  (begin
    (asserts! (not (var-get locked)) ERR_POT_ALREADY_STARTED)
    (asserts!
      (> burn-block-height
        (+ (default-to burn-block-height (var-get first-user-joined))
          MORE_THAN_ONE_CYCLE
        ))
      ERR_TOO_EARLY
    )
    (asserts! (is-eq (contract-of pot-contract) pot-treasury-address)
      ERR_ADMIN_ONLY
    )

    ;; Returns participants principals
    (try! (as-contract? ()
      (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots
        dispatch-principals pot-contract
      ))
    ))

    ;; Set pot cancelled to true
    (var-set pot-cancelled true)

    ;; Print
    (print {
      event: "cancel-pot",
      pot-cancelled: (var-get pot-cancelled),
    })

    ;; Execution complete
    (ok true)
  )
)

;; Public Function That Starts The Jackpot
(define-public (start-stackspot-sequential-pot (pot-contract <stackspot-trait>))
  (begin
    ;; Validates pot is not already started
    (asserts! (not (var-get locked)) ERR_POT_ALREADY_STARTED)
    ;; Validate pot value target is met
    (asserts! (validate-pot-value-target-is-met) ERR_INSUFFICIENT_REWARD)
    ;; Validate pot is not cancelled
    (asserts! (not (var-get pot-cancelled)) ERR_POT_CANCELLED)
    ;; Validate pot treasury is the same as the pot contract
    (asserts! (is-eq pot-treasury-address (contract-of pot-contract))
      ERR_UNAUTHORIZED
    )

    ;; Set lock burn height
    (var-set lock-burn-height (some burn-block-height))

    ;; Delegate treasury to pot contract
    (try! (as-contract? ()
      (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots
        delegate-treasury pot-contract pot-treasury-address
      ))
    ))

    ;; Set pot starter principal
    (var-set pot-starter-principal (some tx-sender))

    ;; Lock pot
    (var-set locked true)

    ;; Print
    (print {
      event: "start-stackspot-jackpot",
      pot-starter-principal: tx-sender,
      pot-contract: (contract-of pot-contract),
      pot-treasury: pot-treasury-address,
      pot-participants: (unwrap! (get-pot-participants) ERR_NOT_FOUND),
      pot-value: (var-get total-pot-value),
      pot-locked: (var-get locked),
      pot-lock-burn-height: (default-to burn-block-height (var-get lock-burn-height)),
      pot-cancelled: (var-get pot-cancelled),
    })

    ;; Execution complete
    (ok true)
  )
)

;; Public function that rewards the pot winner, returns participants principals and rewards pot starter and claimer
(define-public (claim-pot-reward (pot-contract <stackspot-trait>))
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
      (pot-yield (unwrap!
        (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token
          get-balance pot-treasury-address
        )
        (err u997)
      ))
      ;; Get stacked reward
      (pot-starter (get pot-starter-address pot-details))
      (pot-starter-reward (if (> pot-yield u0)
        (* (/ pot-yield u100) u2)
        u0
      ))
      ;; Calculate pot starter's reward
      (claimer tx-sender) ;; Calculate claimer's reward
      (claimer-reward (if (> pot-yield u0)
        (* (/ pot-yield u100) u2)
        u0
      ))
      (pot-winner-id (var-get next-payment-id))
      (winner-values (unwrap! (map-get? pot-participants-by-id pot-winner-id) (err u995)))
      (winner (get participant winner-values))
    )
    ;; Validate can claim pot
    ;; Validate pot yield is greater than 0
    (asserts! (validate-can-claim-pot) ERR_POT_CLAIM_NOT_REACHED)
    (asserts! (> pot-yield u0) ERR_INSUFFICIENT_POT_REWARD)
    (asserts! (not (var-get pot-session-ended)) ERR_POT_SESSION_ENDED)

    ;; Set pot claimer principal
    (var-set pot-claimer-principal (some tx-sender))

    ;; Set winners address
    (var-set winners-values
      (some {
        winner-id: pot-winner-id,
        winner-address: winner,
      })
    )

    (if (is-eq (var-get next-payment-id) total-participants)
      ;; If next payment id is total participants, dispatch rewards and increment next payment id
      (begin
        ;; Returns participants principals
        (try! (as-contract? ()
          (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots
            dispatch-principals pot-contract
          ))
        ))

        ;; Disburse rewards
        (try! (as-contract? ()
          (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots
            dispatch-rewards pot-contract
          ))
        ))

        ;; Revoke delegate treasury
        (try! (as-contract? ()
          (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots
            revoke-delegate-treasury pot-contract
          ))
        ))

        ;; Set pot session ended to true
        (var-set pot-session-ended true)
        ;; Execution complete
        true
      )

      ;; If next payment id is not total participants, extend delegate treasury while cycles are not maxed out
      (begin
        ;; Dispatch rewards
        (try! (as-contract? ()
          (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots
            dispatch-rewards pot-contract
          ))
        ))

        ;; Extend delegate treasury while cycles are not maxed out
        (try! (as-contract? ()
          (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots
            extend-delegate-treasury pot-contract
          ))
        ))

        ;; Increment next payment id
        (var-set next-payment-id (+ (var-get next-payment-id) u1))
      )
    )

    ;; Print
    (print {
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
      pot-owner: pot-admin,
      ;; Pot Config Values
      pot-name: (var-get pot-name),
      pot-type: (var-get pot-type),
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
    })
    ;; Execution complete
    (ok true)
  )
)

(define-read-only (get-pot-session-status)
  (ok (var-get pot-session-ended))
)
(define-read-only (get-pot-cycle)
  (ok (var-get pot-cycle))
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
  (ok (var-get pot-type))
)
(define-read-only (get-pot-origin-contract-sha-hash)
  (contract-hash? current-contract)
)
(define-read-only (get-pot-reward-token)
  (ok "sbtc")
)

(as-contract? ()
  (try! (contract-call?
    'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sim-pox-4-multi-pool-v1
    allow-contract-caller
    'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-distribute none
  ))
)
(as-contract? ()
  (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sim-pox-4
    allow-contract-caller
    'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sim-pox4-multi-pool-v1 none
  ))
)

;; Pot Configuration
(define-data-var initiated bool false)
(define-public (init-pot
    (cycle uint)
    (min-amount uint)
    (max-participants uint)
    (name (string-ascii 255))
    (type (string-ascii 255))
  )
  (begin
    (asserts! (is-eq tx-sender pot-admin) ERR_ADMIN_ONLY)
    (asserts! (not (var-get initiated)) ERR_ALREADY_INIT)

    (var-set pot-cycle cycle)
    (var-set pot-min-amount min-amount)
    (var-set pot-max-participants max-participants)
    (var-set pot-name name)
    (var-set pot-type type)
    
    (var-set initiated true)

    (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots
      register-pot {
      owner: tx-sender,
      contract: current-contract,
      cycles: (var-get pot-cycle),
      type: (var-get pot-type),
      pot-reward-token: "sbtc",
      min-amount: (var-get pot-min-amount),
      max-participants: (var-get pot-max-participants),
    })
  )
)

(define-data-var pot-cycle uint u1)
(define-data-var pot-min-amount uint u100)
(define-data-var pot-max-participants uint u100)
(define-data-var pot-name (string-ascii 255) "")
(define-data-var pot-type (string-ascii 255) "")

(init-pot u1 u100000 u100 "test-001" "stackspot-sequential-pot")

;; --- Rendezvous invariants & property tests ---

;; #[env(simnet)]
(define-map context
  (string-ascii 255)
  { called: uint }
)
;; #[env(simnet)]
(define-public (update-context
    (function-name (string-ascii 100))
    (called uint)
  )
  (ok (map-set context function-name { called: called }))
)

;; #[env(simnet)]
(define-read-only (invariant-locked-and-cancelled-exclusive)
  (not (and (var-get locked) (var-get pot-cancelled)))
)

;; #[env(simnet)]
(define-read-only (invariant-lock-burn-height-iff-locked)
  (is-eq (var-get locked) (is-some (var-get lock-burn-height)))
)

;; #[env(simnet)]
(define-read-only (invariant-locked-implies-starter-set)
  (if (var-get locked)
    (is-some (var-get pot-starter-principal))
    true
  )
)

;; #[env(simnet)]
(define-read-only (invariant-pot-value-ge-min-times-participants)
  (>= (var-get total-pot-value)
    (* (var-get last-participant) (var-get pot-min-amount))
  )
)

;; #[env(simnet)]
(define-read-only (invariant-last-participant-bounded)
  (<= (var-get last-participant) (+ (var-get pot-max-participants) u1))
)

;; #[env(simnet)]
(define-read-only (invariant-participant-bimap-consistent (id uint))
  (match (map-get? pot-participants-by-id id)
    entry (is-eq (some id)
      (map-get? pot-participants-by-principal (get participant entry))
    )
    true
  )
)

;; #[env(simnet)]
(define-read-only (invariant-next-payment-id-bounded)
  (let ((claim-calls (default-to u0 (get called (map-get? context "claim-pot-reward")))))
    (and
      (>= (var-get next-payment-id) u1)
      (<= (var-get next-payment-id) (+ u1 claim-calls))
      (if (not (var-get locked))
        (is-eq (var-get next-payment-id) u1)
        true
      )
    )
  )
)

;; #[env(simnet)]
(define-read-only (invariant-current-target-is-real-participant)
  (let ((target-id (var-get next-payment-id)))
    (if (and (var-get locked) (>= (var-get last-participant) target-id))
      (is-some (map-get? pot-participants-by-id target-id))
      true
    )
  )
)

;; #[env(simnet)]
(define-public (test-join-pot-fails-when-locked (amount uint))
  (begin
    (asserts! (var-get locked) (ok true))
    (asserts! (is-err (join-pot amount)) (err u920))
    (ok true)
  )
)

;; #[env(simnet)]
(define-public (test-start-twice-fails (pot-contract <stackspot-trait>))
  (begin
    (asserts! (var-get locked) (ok true))
    (asserts! (is-err (start-stackspot-sequential-pot pot-contract)) (err u921))
    (ok true)
  )
)
