;; --- Traits
(impl-trait 'SP7FSE31MWSJJFTQBEQ1TT6TF3G4J6GDKE81SWD9.stackspot-trait.stackspot-trait)
(use-trait stackspot-trait 'SP7FSE31MWSJJFTQBEQ1TT6TF3G4J6GDKE81SWD9.stackspot-trait.stackspot-trait)

;; Errors
(define-constant ERR_NOT_FOUND (err u1001))
(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant ERR_ADMIN_ONLY (err u1102))
(define-constant ERR_PARTICIPANT_ONLY (err u1105))
(define-constant ERR_DUPLICATE_PARTICIPANT (err u1104))
(define-constant ERR_INVALID_ADDRESS (err u1201))
(define-constant ERR_INVALID_ARGUMENT_VALUE (err u1202))
(define-constant ERR_INVALID_POT (err u1203))
(define-constant ERR_INSUFFICIENT_BALANCE (err u1301))
(define-constant ERR_INSUFFICIENT_AMOUNT (err u1302))
(define-constant ERR_INSUFFICIENT_POT_BALANCE (err u1303))
(define-constant ERR_INSUFFICIENT_POT_REWARD (err u1304))
(define-constant ERR_POT_JOIN_CLOSED (err u1401))
(define-constant ERR_POT_CLAIM_NOT_REACHED (err u1402))
(define-constant ERR_POT_ALREADY_STARTED (err u1403))
(define-constant ERR_POT_CANCELLED (err u1404))
(define-constant ERR_MAX_PARTICIPANTS_REACHED (err u1405))
(define-constant ERR_DELEGATE_FAILED (err u1406))
(define-constant ERR_DISPATCH_FAILED (err u1108))
(define-constant ERR_POT_JOIN_FAILED (err u1408))
(define-constant ERR_TOO_EARLY (err u1409))
(define-constant ERR_INSUFFICIENT_REWARD (err u1410))

(define-constant JOIN_POT_MEMO (unwrap-panic (to-consensus-buff? "join pot")))
(define-constant LEAVE_POT_MEMO (unwrap-panic (to-consensus-buff? "leave pot")))

;; Pot Starter Principal
;; Pot Claimer Principal
(define-data-var pot-starter-principal (optional principal) none)
(define-data-var pot-claimer-principal (optional principal) none)
(define-data-var winners-values (optional {winner-id: uint, winner-address: principal}) none)

;; Pot Participants Maps
(define-map pot-participants-by-principal principal uint)
(define-map pot-participants-by-id uint {participant: principal, amount: uint})

;; Locking Mechanism To Prevent Participants From Trying To Join The Pot While The Pot Is Stacked In Pool
(define-data-var locked bool false)
(define-data-var lock-burn-height (optional uint) none)
(define-data-var pot-cancelled bool false)
(define-data-var first-user-joined (optional uint) none)

;; Get PoX Info and return pool config
(define-constant pox-data (contract-call? 'SP000000000000000000002Q6VF78.pox-4 get-pox-info))
(define-constant pox-details (unwrap! pox-data ERR_NOT_FOUND))
(define-constant MORE_THAN_ONE_CYCLE (+ (get prepare-cycle-length pox-details) (get reward-cycle-length pox-details)) )

;; Get platform fee
(define-constant platform-fee (contract-call? 'SP7FSE31MWSJJFTQBEQ1TT6TF3G4J6GDKE81SWD9.stackspots get-fee ))

(define-read-only (get-pool-config)
    (let (

            (first (get first-burnchain-block-height pox-details))
            (cycle-len (get reward-cycle-length pox-details))
            (prepare-len (get prepare-cycle-length pox-details))
            (cycle (/ (- (default-to burn-block-height (var-get lock-burn-height)) first) cycle-len))
            (cycle-start (+ first (* cycle cycle-len)))
            (next-cycle-start (+ first (* (+ cycle u1) cycle-len)))
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
    (var-get locked)
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
    (>= (var-get total-pot-value) (* pot-min-amount pot-max-participants))
)

(define-read-only (is-locked)
    (var-get locked)
)

(define-read-only (get-pot-details)
    (ok
        {
            pot-participants-count: (var-get last-participant),
            pot-value: (var-get total-pot-value),
            pot-reward-amount: (unwrap! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance pot-treasury-address) ERR_NOT_FOUND),
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
            is-joined: (map-get? pot-participants-by-principal tx-sender)
        }
    )
)

;; Total Max Participants
;; Platform Address
;; Pot Treasury Address
(define-constant total-max-participants u100)
(define-constant platform-address (contract-call? 'SP7FSE31MWSJJFTQBEQ1TT6TF3G4J6GDKE81SWD9.stackspots get-platform-treasury))

(define-constant pot-treasury-address (as-contract tx-sender))
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
        cycles: pot-cycle,
        min-amount: pot-min-amount,
        max-participants: pot-max-participants,
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
;; Decrement Pot Value
(define-private (remove-pot-value (amount uint))
    (var-set total-pot-value (- (var-get total-pot-value) amount))
)

;; Read-Only public function that gets participant by index
(define-read-only (get-by-id-helper (n uint))
    (ok (map-get? pot-participants-by-id n))
)
(define-read-only (get-by-id-helper-private (n uint))
    (map-get? pot-participants-by-id n)
)

(define-read-only (get-pot-participant-values (participant principal))
    (map-get? pot-participants-by-id (default-to u0 (map-get? pot-participants-by-principal participant)))
)

;; Read-Only public function that gets all participants
(define-read-only (get-pot-participants)
    (let (
            (participants-count (var-get last-participant))
            (n (contract-call? 'SP7FSE31MWSJJFTQBEQ1TT6TF3G4J6GDKE81SWD9.stackspot-vrf generate-list u0 participants-count))
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
    (contract-call? 'SP7FSE31MWSJJFTQBEQ1TT6TF3G4J6GDKE81SWD9.stackspots get-token-id pot-treasury-address)
)

;; Get Pot Starter Principal
(define-read-only (get-pot-starter-principal)
    (ok (var-get pot-starter-principal))
)

;; Get Pot Claimer Principal
(define-read-only (get-pot-claimer-principal)
    (ok (var-get pot-claimer-principal))
)

;; Get random digit from VRF and return the winner index
(define-private (get-random-index (participant-count uint))
    (let (
            ;; Get random digit from VRF
            (vrf-random-digit (unwrap! (contract-call? 'SP7FSE31MWSJJFTQBEQ1TT6TF3G4J6GDKE81SWD9.stackspot-vrf get-random-uint-at-block stacks-block-height) ERR_NOT_FOUND))
        )
        (ok (mod vrf-random-digit participant-count))
    )
)

;; Private helper function that delegates to pot-treasury
(define-private (delegate-to-pot (amount uint) (participant principal))
    (let
        (
            (participants-stx-balance (stx-get-balance participant))
            (index-participants (var-get last-participant))
            (pot-config (get-configs))
            (max-participants (get max-participants pot-config))
            (min-amount (get min-amount pot-config))
        )
        ;; Participants Eligibility Validations
        (asserts! (>= amount min-amount) ERR_INSUFFICIENT_AMOUNT)

        (asserts! (not (is-eq participant pot-treasury-address)) ERR_UNAUTHORIZED)
        (asserts! (not (is-eq participant platform-address)) ERR_UNAUTHORIZED)
        (asserts! (not (is-eq participant pot-admin)) ERR_UNAUTHORIZED)
        (asserts! (not (var-get pot-cancelled)) ERR_POT_CANCELLED)

        (asserts! (<= index-participants max-participants)
            ERR_MAX_PARTICIPANTS_REACHED
        )
        (asserts!
            (is-none (map-get? pot-participants-by-principal participant))
            ERR_DUPLICATE_PARTICIPANT
        )

        ;; Registers Participants Values To The Pot Maps
        (map-insert pot-participants-by-principal participant index-participants)
        (map-insert pot-participants-by-id index-participants {participant: participant, amount: amount})

        ;; Transfers User's Delegated Amount To Pot Treasury
        (asserts! (is-ok (stx-transfer-memo? amount participant pot-treasury-address JOIN_POT_MEMO)) ERR_POT_JOIN_FAILED)

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
            (var-set first-user-joined (print (some burn-block-height))))
        (ok true)
    )
)

(define-public (cancel-pot (pot-contract <stackspot-trait>))
    (begin
      (asserts! (not (var-get locked)) ERR_POT_ALREADY_STARTED)
      (asserts! (> burn-block-height (+ (default-to burn-block-height (var-get first-user-joined)) MORE_THAN_ONE_CYCLE)) ERR_TOO_EARLY)
      (asserts! (is-eq (contract-of pot-contract) pot-treasury-address) ERR_ADMIN_ONLY)

      ;; Returns participants principals
      (try! (as-contract (contract-call? 'SP7FSE31MWSJJFTQBEQ1TT6TF3G4J6GDKE81SWD9.stackspots dispatch-principals pot-contract)))

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
(define-public (start-stackspot-jackpot (pot-contract <stackspot-trait>))
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

        ;; Delegate treasury to pot contract
        (try! (as-contract (contract-call? 'SP7FSE31MWSJJFTQBEQ1TT6TF3G4J6GDKE81SWD9.stackspots delegate-treasury pot-contract pot-treasury-address)))

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
    (let
        (
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
            (pot-yield (unwrap! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance pot-treasury-address) (err u997))) ;; Get stacked reward
            
            (pot-deploy-fee (/ (* pot-yield u5) u100))
            (platform-royalty-reward (/ (* pot-yield u1) u100))

            (pot-starter (get pot-starter-address pot-details))
            (pot-starter-reward (if (> pot-yield u0) (* (/ pot-yield u100) u2) u0));; Calculate pot starter's reward

            (claimer tx-sender) ;; Calculate claimer's reward
            (claimer-reward (if (> pot-yield u0) (* (/ pot-yield u100) u2) u0))

            (pot-winner-id (unwrap! (get-random-index total-participants) (err u996)))
            (winner-values (unwrap! (map-get? pot-participants-by-id pot-winner-id) (err u995)))
            (winner (get participant winner-values))
            (winners-reward (- pot-yield platform-royalty-reward pot-deploy-fee pot-starter-reward claimer-reward)) ;; Calculate winner's reward 90% of stacked reward or 100% of stacked reward
        )
        ;; Validate can claim pot
        (asserts! (validate-can-claim-pot) ERR_POT_CLAIM_NOT_REACHED)
        (asserts! (> pot-yield u0) ERR_INSUFFICIENT_POT_REWARD)

        ;; Set pot claimer principal
        (var-set pot-claimer-principal (some tx-sender))

        ;; Set winners address
        (var-set winners-values (some {winner-id: pot-winner-id, winner-address: winner}))

        ;; Returns participants principals
        (try! (as-contract (contract-call? 'SP7FSE31MWSJJFTQBEQ1TT6TF3G4J6GDKE81SWD9.stackspots dispatch-principals pot-contract)))

        ;; Disburse rewards
        (try! (as-contract (contract-call? 'SP7FSE31MWSJJFTQBEQ1TT6TF3G4J6GDKE81SWD9.stackspots dispatch-rewards pot-contract)))

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
            pot-name: pot-name,
            pot-type: pot-type,
            pot-cycle: pot-cycle,
            pot-reward-token: "sbtc",
            pot-min-amount: pot-min-amount,
            pot-max-participants: pot-max-participants,
            ;; Pot Origination Values
            origin-contract-sha-hash: origin-contract-sha-hash,
            stacks-block-height: stacks-block-height,
            burn-block-height: burn-block-height,
            lock-burn-height: (default-to burn-block-height (var-get lock-burn-height)),
            pot-cancelled: (var-get pot-cancelled),
        })
        ;; Execution complete
        (ok true)
    )
)

(define-read-only (get-pot-cycle) (ok pot-cycle))
(define-read-only (get-pot-min-amount) (ok pot-min-amount))
(define-read-only (get-pot-max-participants) (ok pot-max-participants))
(define-read-only (get-pot-name) (ok pot-name))
(define-read-only (get-pot-type) (ok pot-type))
(define-read-only (get-pot-origin-contract-sha-hash) (ok origin-contract-sha-hash))
(define-read-only (get-pot-reward-token) (ok "sbtc"))

(as-contract (contract-call? 'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.pox4-multi-pool-v1 allow-contract-caller 'SP7FSE31MWSJJFTQBEQ1TT6TF3G4J6GDKE81SWD9.stackspot-distribute none))
(as-contract (contract-call? 'SP000000000000000000002Q6VF78.pox-4 allow-contract-caller 'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.pox4-multi-pool-v1 none))