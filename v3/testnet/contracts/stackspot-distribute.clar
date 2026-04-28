(use-trait stackspot-trait .stackspot-trait.stackspot-trait)

;; --- Not Found
(define-constant ERR_NOT_FOUND (err u1001))
;; --- Authorization
(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant ERR_POT_CLAIM_NOT_REACHED (err u1402))
(define-constant ERR_INSUFFICIENT_POT_REWARD (err u1304))
(define-constant ERR_DISPATCH_FAILED (err u1108))
(define-constant ERR_LOG_FAILED (err u1107))
;; Platform Address
(define-constant platform-address 'ST1QB8J5MM37YXATNMWB06XDT0DJCP2RBCCJ51YT8)

;; Get PoX Info and return pool config
;; Testnet version
(define-read-only (get-pox-info) (unwrap-panic (contract-call? 'ST000000000000000000002AMW42H.pox-4 get-pox-info)))
(define-read-only (get-pool-config (lock-burn-height uint))
    (let
        (
            (pox-details (get-pox-info))
            (first (get first-burnchain-block-height pox-details))
            (cycle-len (get reward-cycle-length pox-details))
            (prepare-len (get prepare-cycle-length pox-details))
            (cycle (/ (- lock-burn-height first) cycle-len))
            (cycle-start (+ first (* cycle cycle-len)))
            (next-cycle-start (+ first (* (+ cycle u1) cycle-len)))
        )
        (ok {
            join-end: (- (- next-cycle-start prepare-len) u300),
            prepare-start: (- next-cycle-start prepare-len),
            cycle-end: next-cycle-start,
            reward-release: (+ next-cycle-start u432)
        })
    )
)

;; ;; Pot Claim Start validation
(define-read-only (validate-can-claim-pot (lock-burn-height uint))
    (let
        (
            (pool-config (unwrap! (get-pool-config lock-burn-height) false))
            (reward-release (get reward-release pool-config))
        )
       (asserts! (> burn-block-height reward-release) false)
       true
    )
)

;; ;; Private helper function that returns participant principals
(define-private (return-participant-principals (participant-value (optional {participant: principal, amount: uint})) (result (response bool uint)))
    (let
        (
            (participant (unwrap! (get participant participant-value) ERR_NOT_FOUND))
            (principal-amount (unwrap! (get amount participant-value) ERR_NOT_FOUND))
        )
        (try! (stx-transfer-memo? principal-amount tx-sender participant
            (unwrap! (to-consensus-buff? "participant principal") ERR_NOT_FOUND)
        ))
        result
    )
)

(define-public (dispatch-principals (contract <stackspot-trait>))
    (let
        (
            (pot-id (unwrap! (contract-call? contract get-pot-id) ERR_NOT_FOUND))
            (pot-treasury (unwrap! (contract-call? contract get-pot-treasury) ERR_NOT_FOUND))
            (participants (unwrap! (contract-call? contract get-pot-participants) ERR_NOT_FOUND))
        )
        ;; Validate's if the pot treasury is the same as the pot treasury address
        (asserts! (is-eq pot-treasury tx-sender) ERR_UNAUTHORIZED)
        ;; Validate's if the contract caller is the allowed caller
        (asserts! (is-eq contract-caller .stackspots) ERR_UNAUTHORIZED)

        ;; ;; Dispatch participants principals
        (try! (fold return-participant-principals participants (ok true)))

        ;; ;; ;; Print event
        (print {
            event: "dispatch-principals",
            pot-id: pot-id,
            participants: participants,
            contract: pot-treasury,
            pot-treasury: pot-treasury,
            contract-caller: contract-caller,
            tx-sender: tx-sender,
        })
        ;; Execution complete
        (ok true)
    )
)

(define-private (dispatch-rewards-with-sbtc (amount uint) (from principal) (to principal) (memo (optional (buff 32))))
    (contract-call? 'ST29A83G76TM23HXCXR0P2C8T52N92ATRVJ2K953R.sbtc-token transfer amount from to memo)
)

(define-public (dispatch-rewards (contract <stackspot-trait>))
    (let
        (

            (pot-details (unwrap! (contract-call? contract get-pot-details) ERR_NOT_FOUND))

            (pot-treasury (unwrap! (contract-call? contract get-pot-treasury) ERR_NOT_FOUND))
            (pot-yield (unwrap! (contract-call? 'ST29A83G76TM23HXCXR0P2C8T52N92ATRVJ2K953R.sbtc-token get-balance pot-treasury) ERR_NOT_FOUND))

            (pot-id (unwrap! (contract-call? contract get-pot-id) ERR_NOT_FOUND))

            ;; Pot Fee
            (pot-owner-address (unwrap! (contract-call? contract get-pot-admin) ERR_NOT_FOUND))
            (pot-fee (/ (* pot-yield u5) u100))

            ;; Platform Royalty
            (platform-royalty-address platform-address)
            (platform-royalty-reward (/ (* pot-yield u1) u100))

            ;; Pot Starter Values
            (pot-starter-address (unwrap! (get pot-starter-address pot-details) ERR_NOT_FOUND))
            (pot-starter-reward (/ (* pot-yield u2) u100))

            ;; Claimer Values
            (claimer-address (unwrap! (get pot-claimer-address pot-details) ERR_NOT_FOUND))
            (claimer-reward (/ (* pot-yield u2) u100))

            ;; Winner Values
            (winner-address (unwrap! (get winner-address (get winners-values pot-details)) ERR_NOT_FOUND))
            (winner-reward
                (- pot-yield
                    platform-royalty-reward
                    pot-fee
                    pot-starter-reward
                    claimer-reward
                )
            )
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

        (and (> platform-royalty-reward u0)
            (try! (dispatch-rewards-with-sbtc platform-royalty-reward pot-treasury platform-royalty-address (to-consensus-buff? "platform royalty reward")))
        )

        ;; Dispatch pot fee reward

        (and (> pot-fee u0)
            (try! (dispatch-rewards-with-sbtc pot-fee pot-treasury pot-owner-address (to-consensus-buff? "pot fee reward")))
        )
        ;; Dispatch pot starter reward

        (and (> pot-starter-reward u0)
            (try! (dispatch-rewards-with-sbtc pot-starter-reward pot-treasury pot-starter-address (to-consensus-buff? "pot starter reward")))
        )

        ;; Dispatch claimer reward
        (and (> claimer-reward u0)
            (try! (dispatch-rewards-with-sbtc claimer-reward pot-treasury claimer-address (to-consensus-buff? "claimer reward")))
        )

        ;; Dispatch winner reward
        (and (> winner-reward u0)
            (try! (dispatch-rewards-with-sbtc winner-reward pot-treasury winner-address (to-consensus-buff? "winner reward")))
        )

        (try! (contract-call? .stackspot-winners log-winner (unwrap! (to-consensus-buff?
            {
                ;; Pot Values
                event: "claim-pot-reward",
                ;; Pot Round Values
                pot-participants-count: (get pot-participants-count pot-details),
                pot-participants: (unwrap! (contract-call? contract get-pot-participants) ERR_NOT_FOUND),
                pot-value: (get pot-value pot-details),
                pot-yield-amount: pot-yield,
                ;; Winner Values
                winners-values:  (unwrap! (get winners-values pot-details) ERR_NOT_FOUND),
                ;; Starter Values
                starter-address: pot-starter-address,
                starter-reward-amount: pot-starter-reward,
                ;; Claimer Values
                claimer-address: claimer-address,
                claimer-reward-amount: claimer-reward,
                ;; Pot Values
                pot-id: pot-id,
                pot-address: pot-treasury,
                pot-owner: pot-owner-address,
                ;; Pot Config Values
                pot-name: (unwrap! (contract-call? contract get-pot-name) ERR_NOT_FOUND),
                pot-type: (unwrap! (contract-call? contract get-pot-type) ERR_NOT_FOUND),
                pot-cycle: (unwrap! (contract-call? contract get-pot-cycle) ERR_NOT_FOUND),
                pot-reward-token: (unwrap! (contract-call? contract get-pot-reward-token) ERR_NOT_FOUND),
                pot-min-amount: (unwrap! (contract-call? contract get-pot-min-amount) ERR_NOT_FOUND),
                pot-max-participants: (unwrap! (contract-call? contract get-pot-max-participants) ERR_NOT_FOUND),
                ;; Pot Origination Values
                origin-contract-sha-hash: (unwrap! (contract-call? contract get-pot-origin-contract-sha-hash) ERR_NOT_FOUND),
                stacks-block-height: stacks-block-height,
                burn-block-height: burn-block-height
            }
            ) ERR_NOT_FOUND))
        )

        ;; Print event
        (print {
            event: "dispatch-rewards",
            pot-id: pot-id,
            pot-starter-address: pot-starter-address,
            pot-starter-reward: pot-starter-reward,
            claimer-address: claimer-address,
            claimer-reward: claimer-reward,
            winner-address: winner-address,
            winner-reward: winner-reward,
            contract: contract,
            pot-treasury: pot-treasury,
            contract-caller: contract-caller,
            tx-sender: tx-sender,
        })

        (ok true)
    )
)

(define-public (delegate-treasury (contract <stackspot-trait>) (delegate-to principal))
    (let
        (
            (treasury-address (unwrap! (contract-call? contract get-pot-treasury) ERR_NOT_FOUND))
            (amount-ustx (stx-get-balance treasury-address))
        )

        ;; ;; Validate's if the pot treasury is the same as the pot treasury address
        ;; ;; Validate's if the contract caller is the allowed caller
        (asserts! (is-eq treasury-address tx-sender) ERR_UNAUTHORIZED)
        (asserts! (is-eq contract-caller .stackspots) ERR_UNAUTHORIZED)

        (print {
            event: "delegate-treasury",
            treasury-address: treasury-address,
            amount-ustx: amount-ustx,
            contract: contract,
            delegate-to: delegate-to,
            tx-sender: tx-sender,
            contract-caller: contract-caller,
        })

        ;; Delegate pot values to pool
        (contract-call? 'ST29W8BBBY984ZY1VD997WKFG1XZSXW4JWY5FM3Z4.sim-pox4-multi-pool-v1 delegate-stx amount-ustx (unwrap! (to-consensus-buff? {c: "sbtc"}) ERR_NOT_FOUND))
    )
)