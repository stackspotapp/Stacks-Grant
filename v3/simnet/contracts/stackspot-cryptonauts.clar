;; --- Traits
(impl-trait 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-trait.stackspot-trait)
(use-trait stackspot-trait 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-trait.stackspot-trait)

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
(define-constant pox-data (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sim-pox-4 get-pox-info))
(define-constant pox-details (unwrap! pox-data ERR_NOT_FOUND))
(define-constant MORE_THAN_ONE_CYCLE (+ (get prepare-cycle-length pox-details) (get reward-cycle-length pox-details)) )

;; Get platform fee
(define-constant platform-fee (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots get-fee ))
(define-constant pot-moderator tx-sender)

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
            (reward-release (* (get reward-release pool-config) pot-cycle))
        )
        (asserts! (> burn-block-height reward-release) false)
    )
)

(define-read-only (is-locked)
    (var-get locked)
)

(define-read-only (get-pot-details)
    (ok
        {
            pot-participants-count: (var-get last-participant),
            pot-value: (var-get total-pot-value),
            pot-reward-amount: (unwrap! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token get-balance pot-treasury-address) ERR_NOT_FOUND),
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
(define-constant platform-address (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots get-platform-treasury))

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
            (n (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-vrf generate-list u0 participants-count))
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
    (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots get-token-id pot-treasury-address)
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

        ;; Update Participant Amount If Participant Already Exists
        (match (map-get? pot-participants-by-principal participant) id 
            (map-set pot-participants-by-id id {participant: participant, amount: (+ amount (default-to u0 (get amount (map-get? pot-participants-by-id id))))})
            (begin 
                ;; Registers Participants Values To The Pot Maps
                (map-insert pot-participants-by-principal participant index-participants)
                (map-insert pot-participants-by-id index-participants {participant: participant, amount: amount})
            )
        )        

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

;; Private helper to clear participants values
(define-private (reset-map-values (index uint) (res (response bool uint))) 
    (let 
        (
            (participant-values (map-get? pot-participants-by-id index))
            (participant (unwrap! (get participant participant-values) (err u999)))
            (amount (get amount participant-values))
        )
        (map-delete pot-participants-by-principal participant)
        (map-delete pot-participants-by-id index)
        res      

    )
)

;; Private helper to reset pot values
(define-private (reset-pot-values)
    (begin 
         ;; Reset pot values
        (var-set lock-burn-height none)
        (var-set pot-starter-principal none)
        (var-set pot-claimer-principal none)
        (var-set locked false)
        (var-set total-pot-value u0)
        (var-set last-participant u0)
        (var-set winners-values none)
        (var-set first-user-joined none)
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
      (asserts! (is-eq tx-sender pot-moderator) ERR_UNAUTHORIZED)
      (asserts! (not (var-get locked)) ERR_POT_ALREADY_STARTED)
      (asserts! (> burn-block-height (+ (default-to burn-block-height (var-get first-user-joined)) MORE_THAN_ONE_CYCLE)) ERR_TOO_EARLY)
      (asserts! (is-eq (contract-of pot-contract) pot-treasury-address) ERR_ADMIN_ONLY)

      ;; Returns participants principals
      (try! (as-contract (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots dispatch-principals pot-contract)))

      ;; Print
      (print {
        event: "cancel-pot",
        pot-cancelled: (var-get pot-cancelled),
      })

      ;; Reset pot values
      (reset-pot-values)

      ;; Execution complete
      (ok true)
    )
)

;; Public Function That Starts The Jackpot
(define-public (start-stackspot-jackpot (pot-contract <stackspot-trait>))
    (begin

        ;; Validate pot moderator is the same as the tx sender
        (asserts! (is-eq tx-sender pot-moderator) ERR_UNAUTHORIZED)
        ;; Validates pot is not already started
        (asserts! (not (var-get locked)) ERR_POT_ALREADY_STARTED)
        ;; Validate pot is not cancelled
        (asserts! (not (var-get pot-cancelled)) ERR_POT_CANCELLED)
        ;; Validate pot treasury is the same as the pot contract
        (asserts! (is-eq pot-treasury-address (contract-of pot-contract)) ERR_UNAUTHORIZED)

        ;; Set lock burn height
        (var-set lock-burn-height (some burn-block-height))

        ;; Delegate treasury to pot contract
        (try! (as-contract (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots delegate-treasury pot-contract pot-treasury-address)))

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
(define-public (cryptonauts-pay-winner (pot-contract <stackspot-trait>) (winner-address principal) (cryptonauts-treasury-address principal))
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
            (generate-participants-list (unwrap! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-vrf generate-list u0 total-participants) (err u998)))

            (participants (unwrap! (get-pot-participants) (err u998))) ;; Get participants list
            (pot-yield (unwrap! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token get-balance pot-treasury-address) (err u997))) ;; Get stacked reward
            
            (pot-deploy-fee u0) ;; Pot deploy fee is 0 for now
            (platform-royalty-reward u0) ;; Platform royalty reward is 0 for now

            (pot-starter (get pot-starter-address pot-details))
            (pot-starter-reward u0) ;; Pot starter reward is 0 for now

            (claimer tx-sender) ;; Calculate claimer's reward
            (claimer-reward u0) ;; Claimer reward is 0 for now

            (pot-winner-id (unwrap! (map-get? pot-participants-by-principal winner-address) (err u996)))
            (winner-values (unwrap! (map-get? pot-participants-by-id pot-winner-id) (err u995)))
            (winner (get participant winner-values))
            (winners-reward (- pot-yield platform-royalty-reward pot-deploy-fee pot-starter-reward claimer-reward)) ;; Calculate winner's reward 90% of stacked reward or 100% of stacked reward
        )
        ;; Validate pot moderator is the same as the tx sender
        (asserts! (is-eq tx-sender pot-moderator) ERR_UNAUTHORIZED)

        ;; Validate can claim pot
        (asserts! (validate-can-claim-pot) ERR_POT_CLAIM_NOT_REACHED)
        (asserts! (> pot-yield u0) ERR_INSUFFICIENT_POT_REWARD)

        ;; Set pot claimer principal
        (var-set pot-claimer-principal (some tx-sender))

        ;; Set winners address
        (var-set winners-values (some {winner-id: pot-winner-id, winner-address: winner}))

        ;; Returns participants principals
        (try! (as-contract (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots dispatch-principals pot-contract)))

        ;; Disburse rewards
        (try! (as-contract (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots dispatch-rewards pot-contract)))
        
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

        ;; Reset saved participants values
        (try! (fold reset-map-values generate-participants-list (ok true)))
        
        ;; Reset pot values
        (reset-pot-values)

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

(as-contract (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sim-pox4-multi-pool-v1 allow-contract-caller 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-distribute none))
(as-contract (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sim-pox-4 allow-contract-caller 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sim-pox4-multi-pool-v1 none))

;; Pot Deployer Configuration
(define-constant pot-cycle u1)
(define-constant pot-min-amount u100)
(define-constant pot-max-participants u100)
(define-constant pot-name "StackSpot Cryptonauts")
(define-constant pot-type "StackSpot Cryptonauts")
(define-constant origin-contract-sha-hash "5c15e5196a9c0afb580a242fbafd41cee6d4fcf5f196d3b2fdc92d7ca30e2bba")
;; Register pot
(contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots register-pot {owner: tx-sender, contract: (as-contract tx-sender), cycles: pot-cycle, type: pot-type, pot-reward-token: "sbtc", min-amount: pot-min-amount, max-participants: pot-max-participants, contract-sha-hash: origin-contract-sha-hash})