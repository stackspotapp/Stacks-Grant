;; title: stackspot-distribute
;; version:
;; summary:
;; description:

(use-trait stackspot-trait .stackspot-trait.stackspot-trait)

;; --- Not Found
(define-constant ERR_NOT_FOUND (err u1001))
;; --- Authorization
(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant ERR_POT_CLAIM_NOT_REACHED (err u1402))
(define-constant ERR_INSUFFICIENT_POT_REWARD (err u1304))
(define-constant ERR_WINNER_NOT_SET (err u1305))
;; Platform Address
(define-constant PLATFORM_ADDRESS tx-sender)

;; Get PoX Info and return pool config
;; Testnet version
(define-read-only (get-pox-info)
  (unwrap-panic (contract-call? 'ST000000000000000000002AMW42H.pox-4 get-pox-info))
)
(define-read-only (get-pool-config (lock-burn-height uint))
  (let (
      (pox-details (get-pox-info))
      (first (get first-burnchain-block-height pox-details))
      (cycle-len (get reward-cycle-length pox-details))
      (prepare-len (get prepare-cycle-length pox-details))
      (cycle (/ (- lock-burn-height first) cycle-len))
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

;;;;  Pot Claim Start validation
(define-read-only (validate-can-claim-pot (lock-burn-height uint))
  (let (
      (pool-config (unwrap! (get-pool-config lock-burn-height) false))
      (reward-release (* (get reward-release pool-config) u1))
    )
    (asserts! (> burn-block-height reward-release) false)
    true
  )
)

;;;;  Private helper function that returns participant principals
(define-private (return-participant-principals (participant-value (optional {participant: principal, amount: uint})) (result (response bool uint)))
  (let (
      (participant (unwrap! (get participant participant-value) ERR_NOT_FOUND))
      (principal-amount (unwrap! (get amount participant-value) ERR_NOT_FOUND))
    )
    (try! (stx-transfer-memo? principal-amount tx-sender participant (unwrap! (to-consensus-buff? "participant principal") ERR_NOT_FOUND)))
    result
  )
)

(define-public (dispatch-principals (contract <stackspot-trait>))
  (let (
      (pot-id (unwrap! (contract-call? contract get-pot-id) ERR_NOT_FOUND))
      (pot-treasury (unwrap! (contract-call? contract get-pot-treasury) ERR_NOT_FOUND))
      (participants (unwrap! (contract-call? contract get-pot-participants) ERR_NOT_FOUND))
    )
    ;; Validate's if the pot treasury is the same as the pot treasury address
    (asserts! (is-eq pot-treasury tx-sender) ERR_UNAUTHORIZED)
    ;; Validate's if the contract caller is the allowed caller
    (asserts! (is-eq contract-caller .stackspots) ERR_UNAUTHORIZED)

    ;;;;  Dispatch participants principals
    (try! (fold return-participant-principals participants (ok true)))

    ;; Execution complete
    (ok true)
  )
)

(define-public (dispatch-sponsor-principals (contract <stackspot-trait>))
  (let (
      (pot-id (unwrap! (contract-call? contract get-pot-id) ERR_NOT_FOUND))
      (pot-treasury (unwrap! (contract-call? contract get-pot-treasury) ERR_NOT_FOUND))
      (sponsors-addresses (unwrap! (contract-call? contract get-sponsors-addresses) ERR_NOT_FOUND))
    )
    ;; Validate's if the pot treasury is the same as the pot treasury address
    (asserts! (is-eq pot-treasury tx-sender) ERR_UNAUTHORIZED)
    ;; Validate's if the contract caller is the allowed caller
    (asserts! (is-eq contract-caller .stackspots) ERR_UNAUTHORIZED)

    ;; Dispatch sponsors principals
    ;;;;  Dispatch participants principals
    (try! (fold return-participant-principals sponsors-addresses (ok true)))

    ;; Execution complete
    (ok true)
  )
)

(define-private (dispatch-rewards-with-sbtc (amount uint) (from principal) (to principal) (memo (optional (buff 32))))
  (contract-call? .sbtc-token transfer amount from to memo)
)

(define-public (dispatch-rewards (contract <stackspot-trait>))
  (let (
      (pot-details (unwrap! (contract-call? contract get-pot-details) ERR_NOT_FOUND))
      (pot-cycle (unwrap! (contract-call? contract get-pot-cycle) ERR_NOT_FOUND))
      (pot-treasury (unwrap! (contract-call? contract get-pot-treasury) ERR_NOT_FOUND))
      (pot-yield (unwrap! (contract-call? .sbtc-token get-balance pot-treasury) ERR_NOT_FOUND))
      (pot-id (unwrap! (contract-call? contract get-pot-id) ERR_NOT_FOUND))
      ;; Pot Fee
      (pot-owner-address (unwrap! (contract-call? contract get-pot-admin) ERR_NOT_FOUND))
      (pot-fee (/ (* pot-yield u5) u100))
      ;; Platform Royalty
      (platform-royalty-address PLATFORM_ADDRESS)
      (platform-royalty-reward (/ (* pot-yield u1) u100))
      ;; Pot Starter Values
      (pot-starter-address (unwrap! (get pot-starter-address pot-details) ERR_NOT_FOUND))
      (pot-starter-reward (/ (* pot-yield u2) u100))
      ;; Claimer Values
      (claimer-address (unwrap! (get pot-claimer-address pot-details) ERR_NOT_FOUND))
      (claimer-reward (/ (* pot-yield u2) u100))
      ;; Winner Values
      (winner-address (unwrap! (get winner-address (get winners-values pot-details)) ERR_WINNER_NOT_SET))
      (winner-reward (- pot-yield platform-royalty-reward pot-fee pot-starter-reward claimer-reward))
    )
    ;; Validate's if the pot claim is not reached
    ;; Validate's if the pot yeild is greater than 0
    ;; Validate's if the pot treasury is the same as the tx-sender
    ;; Validate's if the contract caller is the allowed caller
    (asserts! (validate-can-claim-pot (get pot-lock-burn-height pot-details)) ERR_POT_CLAIM_NOT_REACHED)
    (asserts! (> pot-yield u0) ERR_INSUFFICIENT_POT_REWARD)
    (asserts! (is-eq pot-treasury tx-sender) ERR_UNAUTHORIZED)
    (asserts! (is-eq contract-caller .stackspots) ERR_UNAUTHORIZED)

    ;; Dispatch platform royalty reward

    (and
      (> platform-royalty-reward u0)
      (try! (dispatch-rewards-with-sbtc platform-royalty-reward pot-treasury platform-royalty-address (to-consensus-buff? "platform royalty reward")))
    )

    ;; Dispatch pot fee reward

    (and
      (> pot-fee u0)
      (try! (dispatch-rewards-with-sbtc pot-fee pot-treasury pot-owner-address (to-consensus-buff? "pot fee reward")))
    )
    ;; Dispatch pot starter reward

    (and
      (> pot-starter-reward u0)
      (try! (dispatch-rewards-with-sbtc pot-starter-reward pot-treasury pot-starter-address (to-consensus-buff? "pot starter reward")))
    )

    ;; Dispatch claimer reward
    (and
      (> claimer-reward u0)
      (try! (dispatch-rewards-with-sbtc claimer-reward pot-treasury claimer-address (to-consensus-buff? "claimer reward")))
    )

    ;; Dispatch winner reward
    (and
      (> winner-reward u0)
      (try! (dispatch-rewards-with-sbtc winner-reward pot-treasury winner-address (to-consensus-buff? "winner reward")))
    )
    
    (ok true)
  )
)

(define-public (delegate-treasury (contract <stackspot-trait>) (delegate-to principal))
  (let (
      (treasury-address (unwrap! (contract-call? contract get-pot-treasury) ERR_NOT_FOUND))
      (amount-ustx (stx-get-balance treasury-address))
    )
    ;;;;  Validate's if the pot treasury is the same as the pot treasury address
    ;;;;  Validate's if the contract caller is the allowed caller
    (asserts! (is-eq treasury-address tx-sender) ERR_UNAUTHORIZED)
    (asserts! (is-eq contract-caller .stackspots) ERR_UNAUTHORIZED)

    ;; Delegate pot values to pool
    (contract-call? .sim-pox-4-multi-pool-v1 delegate-stx amount-ustx (unwrap! (to-consensus-buff? { c: "sbtc" }) ERR_NOT_FOUND))
  )
)

(define-public (extend-delegate-treasury (contract <stackspot-trait>))
  (let (
      (treasury-address (unwrap! (contract-call? contract get-pot-treasury) ERR_NOT_FOUND))
    )
    ;; Validate's if the pot treasury is the same as the pot treasury address
    (asserts! (is-eq treasury-address tx-sender) ERR_UNAUTHORIZED)
    (asserts! (is-eq contract-caller .stackspots) ERR_UNAUTHORIZED)

    (try! (contract-call? .sim-pox-4-multi-pool-v1 delegate-stack-stx treasury-address))

    (ok true)
  )
)

(define-public (revoke-delegate-treasury (contract <stackspot-trait>))
  (let (
      (treasury-address (unwrap! (contract-call? contract get-pot-treasury) ERR_NOT_FOUND))
    )
    ;; Validate's if the pot treasury is the same as the pot treasury address
    (asserts! (is-eq treasury-address tx-sender) ERR_UNAUTHORIZED)
    (asserts! (is-eq contract-caller .stackspots) ERR_UNAUTHORIZED)  

    (match (contract-call? 'ST000000000000000000002AMW42H.pox-4 revoke-delegate-stx) 
      success (ok (some success))
      error (err (to-uint error))
    )
  )
)