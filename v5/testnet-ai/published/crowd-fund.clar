;; title: crowd-fund
;; version: 1.0.0
;; summary: Stackspots Crowd-fund pot (simnet / PoX-5)
;; description: Fixed funding recipient. Staking + payouts happen on this contract.

;; --- TRAITS
  (impl-trait 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspot-pots-trait.stackspot-pots-trait)
  (use-trait stackspot-pots-trait 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspot-pots-trait.stackspot-pots-trait)
  (use-trait stackspot-sponsor-trait 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspot-sponsor-trait.stackspot-sponsor-trait)
;; --------------------------------------------------------------------------------------------

;; CONATANTS
  ;; Errors
    (define-constant err_not_found (err u1001))

    (define-constant err_unauthorized (err u1101))
    (define-constant err_admin_only (err u1102))

    (define-constant err_duplicate_participant (err u1201))
    (define-constant err_duplicate_sponsor (err u1202))
    (define-constant err_invalid_argument_value (err u1203))

    (define-constant err_insufficient_amount (err u1301))
    (define-constant err_insufficient_pot_reward (err u1302))
    (define-constant err_insufficient_reward (err u1303))
    (define-constant err_winner_not_set (err u1305))

    (define-constant err_pot_join_closed (err u1401))
    (define-constant err_pot_claim_not_reached (err u1402))
    (define-constant err_pot_already_started (err u1403))
    (define-constant err_pot_cancelled (err u1404))
    (define-constant err_max_participants_reached (err u1405))
    (define-constant err_max_sponsors_reached (err u1406))
    (define-constant err_pot_join_failed (err u1407))
    (define-constant err_too_early (err u1408))
    (define-constant err_already_init (err u1409))
    (define-constant err_not_initiated (err u1410))
    (define-constant err_pot_session_ended (err u1411))
    (define-constant err_try_again_after_prepare_start (err u1412))
  ;; ---

    ;; Fastpool: "A staker tried to claim rewards, but they had none available"
    ;; PoX-5: distribution already computed for this window
      (define-constant FASTPOOL_ERR_NO_CLAIMABLE_REWARDS u1001)
      (define-constant POX5_ERR_DISTRIBUTION_ALREADY_COMPUTED u30)
    ;; ---

  (define-constant pot-type "crowd-fund")
  ;; Platform, pot-treasury and admin addresses
    (define-constant platform_address (contract-call? 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspots get-platform-treasury))
    (define-constant pot_treasury_address current-contract)
    (define-constant pot_admin tx-sender)
  ;; ---

  ;; Get PoX Info and return pool config
    (define-constant pox_data (unwrap! (contract-call? 'ST000000000000000000002AMW42H.pox-5 get-pox-info) err_not_found))
    (define-constant more_than_one_cycle (+ (get prepare-cycle-length pox_data) (get reward-cycle-length pox_data)))
  ;; ---
;; --------------------------------------------------------------------------------------------

;; DATA VAR'S
  ;; Pot Starter Principal
  (define-data-var pot-starter-principal (optional principal) none)
  ;; Pot Claimer Principal
  (define-data-var pot-claimer-principal (optional principal) none)
  ;; Winners values
  (define-data-var winners-values (optional {winner-id: uint, winner-address: principal}) none)

  ;; Locking Mechanism To Prevent Participants From Trying To Join The Pot While The Pot Is Stacked In Pool
  (define-data-var locked bool false)
  (define-data-var lock-burn-height (optional uint) none)
  (define-data-var first-user-joined (optional uint) none)

  (define-data-var pot-name (string-ascii 255) "")
  (define-data-var pot-cycle uint u1)
  (define-data-var pot-min-amount uint u100000000)
  (define-data-var last-pot-participant uint u0)
  (define-data-var pot-max-participants uint u0)
  (define-data-var pot-session-ended bool false)
  (define-data-var pot-cancelled bool false)
  (define-data-var funding-address principal tx-sender)
  
  (define-data-var sponsor-amount uint u0)
  (define-data-var last-sponsors-count uint u0)
  (define-data-var expected-total-platform-sponsor-yield uint u0)

  (define-data-var initiated bool false) 

  ;; Track PoX-5 stake metadata for claim timing / reward attribution
    (define-map staked-cycles uint uint)
  ;; ---

;; --------------------------------------------------------------------------------------------

;; STORAGE MAP'S
  ;; Pot Participants Maps
    (define-map pot-participants-by-principal principal uint)
    (define-map pot-participants-by-id uint {participant: principal, amount: uint})

  ;; Sponsors Maps
    (define-map sponsors-by-principal principal uint)
    (define-map sponsors-by-id uint {participant: principal, amount: uint})
    
  ;; Platform sponsor tickets (sponsor contract -> ticket-id)
    (define-map platform-sponsor-tickets principal {ticket: uint, state: bool})
;; --------------------------------------------------------------------------------------------

;; READ ONLY FUNCTION
  ;; Pot validations
    ;; Pot Join Start validation
    (define-read-only (can-join-pot)
      (not (var-get locked))
    )

    ;; Pot Claim Start validation (reward-release = PoX-5 unlock height + buffer)
    (define-read-only (can-claim-pot)
      (let (
          (pool-config (unwrap! (get-pool-config) false))
          (reward-release (get reward-release pool-config))
        )
        (asserts! (> burn-block-height reward-release) false)
      )
    )

    ;; This function validates that the reward covers the pot deployment fees`
    (define-read-only (is-pot-value-target-met)
      (>= (- (stx-get-balance current-contract) (var-get sponsor-amount)) (* (var-get pot-min-amount) (var-get pot-max-participants)))
    )

    (define-read-only (is-pot-locked)
      (var-get locked)
    )
  ;; ---
 
  ;; Participants values getter helper
    (define-read-only (get-pot-participant-values (participant principal))
      (map-get? pot-participants-by-id (unwrap! (map-get? pot-participants-by-principal participant) none))
    )

    (define-read-only (get-by-id-helper-private (n uint))
      (map-get? pot-participants-by-id n)
    )
  ;; ---

  (define-read-only (get-pool-config)
    (let (
        (first (get first-burnchain-block-height pox_data))
        (cycle-len (get reward-cycle-length pox_data))
        (prepare-len (get prepare-cycle-length pox_data))
        (cycle (/ (- (default-to burn-block-height (var-get lock-burn-height)) first) cycle-len))
        ;; Next reward-cycle boundary after lock (join / prepare window)
        (next-cycle-start (+ first (* (+ cycle u1) cycle-len)))
        ;; PoX-5 unlock height = start of cycle (lock-cycle + 1 + staked-cycles)
        (n (if (is-eq (var-get pot-cycle) u0) u1 (var-get pot-cycle)))
        (unlock-cycle-start (+ first (* (+ cycle u1 n) cycle-len)))
      )
      (ok {
        join-end: (- (- next-cycle-start prepare-len) u300),
        prepare-start: (- next-cycle-start prepare-len),
        cycle-end: unlock-cycle-start,
        reward-release: (+ unlock-cycle-start u432),
      })
    )
  )

  (define-read-only (get-pot-details)
    (ok 
      {
        pot-participants-count: (var-get last-pot-participant),
        pot-value: (stx-get-balance pot_treasury_address),
        pot-reward-amount: (unwrap-panic (contract-call? 'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token get-balance current-contract)),
        pot-participant-values: (get-pot-participant-values tx-sender),
        
        winners-values: (var-get winners-values),
        pot-starter-address: (var-get pot-starter-principal),
        pot-claimer-address: (var-get pot-claimer-principal),
        
        pool-config: (unwrap-panic (get-pool-config)),
        pot-locked: (var-get locked),
        pot-lock-burn-height: (default-to burn-block-height (var-get lock-burn-height)),
        pot-cancelled: (var-get pot-cancelled),
        is-participant: (is-some (map-get? pot-participants-by-principal tx-sender)),
        is-sponsor: (is-some (map-get? sponsors-by-principal tx-sender)),

        platform-estimated-yield: (var-get expected-total-platform-sponsor-yield)
      }
    )
  )

  (define-read-only (get-pot-treasury)
    (ok pot_treasury_address)
  )

  (define-read-only (get-pot-admin)
    (ok pot_admin)
  )

  (define-read-only (get-pot-id)
    (contract-call? 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspots get-token-id current-contract)
  )

  (define-read-only (get-pot-participants-list)
    (let (
        (participants-count (var-get last-pot-participant))
        (n (contract-call? 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspot-vrf generate-list u0 participants-count))
        (participants (match n
          value (map get-by-id-helper-private value)
          (list)
        ))
      )
      (ok participants)
    )
  )

  (define-read-only (get-by-id-helper-sponsor (n uint))
    (map-get? sponsors-by-id n)
  )

  ;; Read-Only public function that gets all participants
  (define-read-only (get-sponsors-list)
    (let 
      (
        (n (contract-call? 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspot-vrf generate-list u0 (var-get last-sponsors-count)))
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

  (define-read-only (get-winner) 
    (decide-winner)
  )
;; --------------------------------------------------------------------------------------------

;; PRIVATE FUNCTION
  ;; Sponsor helper  
    (define-private (register-to-platform-sponsor (sponsor <stackspot-sponsor-trait>) (pot <stackspot-pots-trait>))
      (let 
        (
          (ticket (unwrap-panic (as-contract? () (try! (contract-call? sponsor sponsor-event pot)))))
          (estimated-sponsor-rewards (unwrap-panic (contract-call? sponsor get-total-rule-score)))
        ) 
        ;; Record sponsor and registered ticket
        (map-set platform-sponsor-tickets (contract-of sponsor) {ticket: ticket, state: (> ticket u0)})
        (var-set expected-total-platform-sponsor-yield (+ (var-get expected-total-platform-sponsor-yield) estimated-sponsor-rewards))
        (ok {sponsor-contract: (contract-of sponsor), ticket-id: ticket})
      )
    )

    (define-private (dispatch-platform-sponsor-rewards (sponsor <stackspot-sponsor-trait>) (pot-contract <stackspot-pots-trait>)) 
      (let 
        (
          (ticket (unwrap-panic (get ticket (map-get? platform-sponsor-tickets (contract-of sponsor)))))
        )         
        (if (> ticket u0) 
          (begin
            (try! (contract-call? sponsor claim-sponsor-reward pot-contract ticket)) 
            (ok true)
          ) 
          (ok false)
        )
      )
    )
  ;; ---

  ;; Platform Spponsor yield withdraws
    (define-private (claim-one-platform-sponsor (sponsor <stackspot-sponsor-trait>) (pot-contract (response <stackspot-pots-trait> uint)))
      (let (
          (ticket-id (unwrap-panic (map-get? platform-sponsor-tickets (contract-of sponsor))))
          (ticket (get ticket ticket-id))
          (pot (unwrap-panic pot-contract))
        )
        (try! (as-contract? ((with-nft (contract-of sponsor) "pot-ticket" (list ticket))) (try! (contract-call? sponsor claim-sponsor-reward pot ticket))))
        pot-contract
      )
    )
  ;; ---

  (define-private (return-participant-principals (participant-value (optional {participant: principal, amount: uint})) (result (response bool uint)))
    (let (
        (participant (unwrap-panic (get participant participant-value)))
        (principal-amount (unwrap-panic (get amount participant-value)))
      )
      (try! (stx-transfer-memo? principal-amount tx-sender participant (unwrap-panic (to-consensus-buff? "participant principal"))))
      result
    )
  )

  (define-private (dispatch-principals)
    (let 
      (
        (participants (unwrap-panic (get-pot-participants-list)))
      )
      (try! (fold return-participant-principals participants (ok true)))
      (ok true)
    )
  )

  (define-private (dispatch-sponsor-principals)
    (let (
        (sponsors-addresses (unwrap-panic (get-sponsors-list)))
      )
      (try! (fold return-participant-principals sponsors-addresses (ok true)))
      (ok true)
    )
  )

  (define-private (dispatch-rewards-with-sbtc (amount uint) (from principal) (to principal) (memo (optional (buff 32))))
    (contract-call? 'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token transfer amount from to memo)
  )

  ;; Split pot sBTC yield: 1% platform, 5% pot owner, 2% starter, 2% claimer, rest winner
  (define-private (dispatch-rewards)
    (let (
        (pot-yield (unwrap-panic (contract-call? 'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token get-balance current-contract)))
        (pot-fee (/ (* pot-yield u5) u100))
        (platform-royalty-reward (/ (* pot-yield u1) u100))
        (pot-starter-address (unwrap-panic (var-get pot-starter-principal)))
        (pot-starter-reward (/ (* pot-yield u2) u100))
        (claimer-address (unwrap-panic (var-get pot-claimer-principal)))
        (claimer-reward (/ (* pot-yield u2) u100))
        (winner-address (unwrap-panic (get winner-address (var-get winners-values))))
        (winner-reward (- pot-yield platform-royalty-reward pot-fee pot-starter-reward claimer-reward))
      )

      (and
        (> platform-royalty-reward u0)
        (try! (dispatch-rewards-with-sbtc platform-royalty-reward current-contract platform_address (to-consensus-buff? "platform royalty reward")))
      )
      (and
        (> pot-fee u0)
        (try! (dispatch-rewards-with-sbtc pot-fee current-contract pot_admin (to-consensus-buff? "pot fee reward")))
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

  ;; This Function will be different for all pot types
  (define-private (decide-winner) 
    {winner-id: u0, winner-address: (var-get funding-address)}
  )
;; ---------------------------------------------------------------------------

;; PUBLIC FUNCTION
  ;; Pot Configuration inits
    (define-public (init-pot (cycle uint) (min-amount uint) (max-participants uint) (name (string-ascii 255)) (address-to-fund principal) (contract <stackspot-pots-trait>) (sponsors (list 3 <stackspot-sponsor-trait>)))
      (begin
        (asserts! (is-eq tx-sender pot_admin) err_admin_only)
        (asserts! (not (var-get initiated)) err_already_init)
        (asserts! (is-eq (contract-of contract) current-contract) err_unauthorized)
        (asserts! (<= max-participants u100) err_invalid_argument_value)
        (asserts! (<= cycle u96) err_invalid_argument_value)
        
        (var-set pot-name name)
        (var-set pot-cycle cycle)
        (var-set pot-min-amount min-amount)
        (var-set pot-max-participants max-participants)
        (var-set funding-address address-to-fund)
        
        (var-set initiated true)

        (let 
          (
            (sponsor-tickets (map register-to-platform-sponsor sponsors (list contract)))
            (payload (unwrap-panic (to-consensus-buff? 
              {
                event: "init-pot",
                owner: tx-sender,
                contract: current-contract,
                cycles: (var-get pot-cycle),
                type: pot-type,
                pot-reward-token: "sbtc",
                min-amount: (var-get pot-min-amount),
                max-participants: (var-get pot-max-participants),
                sponsors: sponsor-tickets
              }
            )))
          )

          (print payload)

          (contract-call? 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspots register-pot payload contract)
        )
      )
    )

  ;; Function to join pot as a participant
    (define-public (join-pot (amount uint))      
      (let 
        (
          (index-participants (var-get last-pot-participant))
          (max-participants (var-get pot-max-participants))
          (min-amount (var-get pot-min-amount))
        )
          
        (asserts! (var-get initiated) err_not_initiated) ;; Ensures the pot is initialized
        (asserts! (can-join-pot) err_pot_join_closed) ;; Ensures pot is not locked and still joinable
        (asserts! (<= index-participants (- max-participants u1)) err_max_participants_reached) ;; Ensures the new index is withen allowed maximum entries indexing
        (asserts! (>= amount min-amount) err_insufficient_amount) ;; Ensures join amount is above allowed minimum entry amount
        (asserts! (not (is-eq tx-sender current-contract)) err_unauthorized) ;; Ensures tx-sender is not the current pot address
        (asserts! (not (var-get pot-cancelled)) err_pot_cancelled) ;; Ensures pot has not beign canclled
        (asserts! (is-none (map-get? pot-participants-by-principal tx-sender)) err_duplicate_participant) ;; Ensures new users hasn't joined before

        ;; Transfers User's Delegated Amount To Pot Treasury
        (try! (stx-transfer? amount tx-sender pot_treasury_address))

        ;; Registers Participants Values To The Pot Maps
        (map-insert pot-participants-by-principal tx-sender index-participants)
        (map-insert pot-participants-by-id index-participants {participant: tx-sender, amount: amount})

        ;; Updates Last Participant To Next Pot Joiner's index
        (var-set last-pot-participant (+ index-participants u1))

        ;; Set first user joined burn height
        (and
          (is-none (var-get first-user-joined))
          (var-set first-user-joined (print (some burn-block-height)))
        )

        ;; Action Log (pot + stackspots)
        (let ((payload (unwrap! (to-consensus-buff? 
            {
              event: "join-pot",
              participant: tx-sender,
              amount: amount,
              index: index-participants,
            }) err_not_found))
          )
          (print payload)
          (try! (contract-call? 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspots log-join-pot payload))
        )

        ;; Execution Complete
        (ok true)
      )
    )

  ;; Function to join pot as a sponsor
    (define-public (join-pot-as-sponsor (amount uint))
      (begin
        (asserts! (> amount u0) err_insufficient_amount) ;; Ensures sponsore amount is greater than 0
        (asserts! (var-get initiated) err_not_initiated) ;; Ensures pot is initialized
        (asserts! (can-join-pot) err_pot_join_closed) ;; Ensures pot is not locked
        (asserts! (not (is-eq tx-sender current-contract)) err_unauthorized) ;; Ensures tx-sender is not current pot address
        (asserts! (not (var-get pot-cancelled)) err_pot_cancelled) ;; Ensures pot is not cancelled
        (asserts! (<= (var-get last-sponsors-count) u99) err_max_sponsors_reached) ;; Ensures Sponsors are not more than 100
        (asserts! (is-none (map-get? sponsors-by-principal tx-sender)) err_duplicate_sponsor) ;; Ensures there are no duplicate entries for sponsors

        ;; Transfers Sponsor's Amount To Pot
        (try! (stx-transfer? amount tx-sender current-contract))

        ;; Registers Sponsors Values To The Sponsors Maps
        (map-insert sponsors-by-principal tx-sender (var-get last-sponsors-count))
        (map-insert sponsors-by-id (var-get last-sponsors-count) {participant: tx-sender, amount: amount})

        ;; Updates Sponsor Amount
        (var-set sponsor-amount (+ (var-get sponsor-amount) amount))

        ;; Updates Last Sponsor To Next Sponsor Joiner
        (var-set last-sponsors-count (+ (var-get last-sponsors-count) u1))

        ;; Action Log (pot + stackspots)
        (let (
            (payload (unwrap! (to-consensus-buff? {
              event: "join-pot-as-sponsor",
              sponsor: tx-sender,
              amount: amount,
              sponsors-count: (var-get last-sponsors-count),
            }) err_not_found))
          )
          (print payload)
          (try! (contract-call? 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspots log-join-pot-as-sponsor payload))
        )

        ;; Execution Complete
        (ok true)
      )
    )

  ;; Function that Starts the delegations of the pot
    (define-public (start-pot (pot-contract <stackspot-pots-trait>))
      (let 
        (
          (total-treasury-balance (stx-get-balance current-contract))
          (cycles (var-get pot-cycle))
          (pool-config (unwrap-panic (get-pool-config)))
          (prepare-start (get prepare-start pool-config))
        )
        (asserts! (not (var-get locked)) err_pot_already_started) ;; Ensures pot is not locked at point of start
        (asserts! (is-pot-value-target-met) err_insufficient_reward) ;; Ensures traget amount is met before permiting pot delegations to pox
        (asserts! (not (var-get pot-cancelled)) err_pot_cancelled) ;; Ensures pot is not cancelled
        (asserts! (is-eq current-contract (contract-of pot-contract)) err_unauthorized) ;; Ensures pot-contract is the current contract
        (asserts! (< burn-block-height prepare-start) err_try_again_after_prepare_start) ;; Ensures burn block height is greater than prepare start


        ;; Stake treasury into PoX-5 via Fastpool
        (try! (as-contract? ((with-stx total-treasury-balance) (with-staking total-treasury-balance))
          (try! (contract-call? 'ST000000000000000000002AMW42H.pox-5 stake 'ST31XHNM0GZ2K978FPP4QA3STNQ73Z8C9G9MJEPK2.signer-manager total-treasury-balance cycles burn-block-height none))
        ))

        ;; Set lock burn height
        (var-set lock-burn-height (some burn-block-height))

        ;; Set pot starter principal
        (var-set pot-starter-principal (some tx-sender))

        ;; Lock pot
        (var-set locked true)

        ;; Action Log (pot + stackspots)
        (let (
            (payload  
              {
                event: "start-pot",
                pot-starter-principal: tx-sender,
                pot-contract: current-contract,
                pot-treasury: pot_treasury_address,              
                pot-value: total-treasury-balance,
                pot-locked: (var-get locked),
                pot-lock-burn-height: (default-to burn-block-height (var-get lock-burn-height)),
                pot-cancelled: (var-get pot-cancelled)
              }
            )
          )
          (print (merge {pot-participants: (unwrap! (get-pot-participants-list) err_not_found)} payload))
          (try! (contract-call? 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspots log-start-pot (unwrap! (to-consensus-buff? payload ) err_not_found)))
        )

        ;; Execution complete
        (ok true)
      )
    )

  ;; Function that rewards the pot winner, returns participants principals and rewards pot starter and claimer
    (define-public (claim-pot-reward (pot-contract <stackspot-pots-trait>) (sponsors (list 5 <stackspot-sponsor-trait>)))
      (begin
        ;; Validate can claim pot
        (asserts! (not (var-get pot-cancelled)) err_pot_cancelled) ;; Ensures pot wasn't cancelled
        (asserts! (can-claim-pot) err_pot_claim_not_reached) ;; Ensures sBTC rewards can be claimed
        (asserts! (is-eq current-contract (contract-of pot-contract)) err_unauthorized) ;; Ensures the current contract is the passed pot contract

        ;; Pull platform-sponsor sBTC onto this pot before STX/sBTC distributions
        (try! (fold claim-one-platform-sponsor sponsors (ok pot-contract)))

        (let 
          (
            ;; Get pot details
            (pot-details (unwrap-panic (get-pot-details)))
            ;; @value: pot ID
            ;; @value: pot winner's ID
            ;; @value: pot winner's {participant: principal, amount: uint}
            ;; @value: pot winner's principal
            ;; @value: pot winner's reward
            (pot-id (get-pot-id))
            (total-participants (get pot-participants-count pot-details))
            (participants (unwrap-panic (get-pot-participants-list))) ;; Get participants list
            (pot-yield (unwrap-panic (contract-call? 'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token get-balance current-contract)))
            ;; Get stacked reward
            (pot-starter (get pot-starter-address pot-details))
            (pot-starter-reward (if (> pot-yield u0) (* (/ pot-yield u100) u2) u0))
            ;; Calculate pot starter's reward
            (claimer tx-sender) ;; Calculate claimer's reward
            (claimer-reward (if (> pot-yield u0) (* (/ pot-yield u100) u2) u0))
            ;; Calculate winner's reward 90% of stacked reward or 100% of stacked reward
            (total-balance (stx-get-balance current-contract))
            (total-sponsor-amount (var-get sponsor-amount))
            (total-participants-amounts (- total-balance total-sponsor-amount))
            ;; current target amount
            (current-target-amount (* (var-get pot-min-amount) (var-get last-pot-participant)))
          )
          (asserts! (or (> pot-yield u0) (>= total-balance current-target-amount)) err_insufficient_reward)
          ;; Set pot claimer principal
          (var-set pot-claimer-principal (some tx-sender))

          ;; Set winners address
          (var-set winners-values (some (decide-winner)))

          (if (not (var-get pot-session-ended)) 
            (begin
              ;; Returns participants principals (STX unlocked after PoX-5 unlock height)
              (if (> total-participants-amounts u0) 
                (try! (as-contract? ((with-stx total-participants-amounts))
                    (try! (dispatch-principals))
                  )
                )
                false
              )

              ;; Returns sponsors principals
              (if (> total-sponsor-amount u0) 
                (try! (as-contract? ((with-stx total-sponsor-amount))
                    (try! (dispatch-sponsor-principals))
                  )
                )
                false
              )

              ;; Disburse rewards
              (if (> pot-yield u0) 
                (try! (as-contract? ((with-ft 'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token "sbtc-token" pot-yield))
                    (try! (dispatch-rewards))
                  )
                )
                false
              )              

              (var-set pot-session-ended true)
              (var-set sponsor-amount u0)

              true
            )
            (begin
              ;; Disburse rewards
              (if (> pot-yield u0) 
                (try! (as-contract? ((with-ft 'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token "sbtc-token" pot-yield))
                  (try! (dispatch-rewards))
                )
                )
                false
              )              
            )
          )

          ;; Action Log (pot + stackspots). Full participant list stays on the pot print;
          ;; the stackspots buff omits it so it fits `(buff 2048)`.
            (let 
              (
                (payload 
                  {
                    event: "claim-pot-reward",

                    pot-participants-count: total-participants,                  
                    pot-value: total-balance,
                    pot-yield-amount: pot-yield,

                    winners-values: (var-get winners-values),

                    starter-address: pot-starter,
                    starter-reward-amount: pot-starter-reward,

                    claimer-address: claimer,
                    claimer-reward-amount: claimer-reward,

                    pot-id: pot-id,
                    pot-address: current-contract,
                    pot-owner: pot_admin,

                    pot-name: (var-get pot-name),
                    pot-type: pot-type,
                    pot-cycle: (var-get pot-cycle),
                    pot-reward-token: "sbtc",
                    pot-min-amount: (var-get pot-min-amount),
                    pot-max-participants: (var-get pot-max-participants),

                    origin-contract-sha-hash: (unwrap-panic (contract-hash? current-contract)),
                    stacks-block-height: stacks-block-height,
                    burn-block-height: burn-block-height,
                    lock-burn-height: (default-to burn-block-height (var-get lock-burn-height)),
                    pot-cancelled: (var-get pot-cancelled),
                    pot-is-init: (var-get initiated)                  
                  }
                )
              )          

              (print (merge 
                {
                  pot-participants: participants,
                  sponsors: (get-sponsors-list)
                } payload)
              )

              (try! (contract-call? 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspots log-claim-pot-reward (unwrap-panic (to-consensus-buff? payload))))
            )     
          ;;  ---

          ;; Execution complete
          (ok true)
        )
      )
    )

    (define-public (cancel-pot (pot-contract <stackspot-pots-trait>))
      (let
        (
          (total-delgations (stx-get-balance current-contract))
          (total-participants-delegations (- total-delgations (var-get sponsor-amount)))
          (is-locked (> (get locked (stx-account current-contract)) u0))
        )
        (asserts! (not (var-get pot-cancelled)) err_pot_cancelled)
        (asserts! 
          (or 
            (and (> burn-block-height (+ (default-to u0 (var-get lock-burn-height)) (* more_than_one_cycle (var-get pot-cycle)))) is-locked) 
            (and (> burn-block-height (+ (default-to u0 (var-get first-user-joined)) more_than_one_cycle)) (not is-locked))
          ) 
        err_too_early)
        (asserts! (is-eq (contract-of pot-contract) current-contract) err_unauthorized)

        ;; Unstake treasury from PoX-5 if intended staked cycle has passed
        (if is-locked
          (begin 
            (try! (as-contract? ((with-pox))
              (try! (contract-call? 'ST000000000000000000002AMW42H.pox-5 unstake 'ST31XHNM0GZ2K978FPP4QA3STNQ73Z8C9G9MJEPK2.signer-manager))
            ))
            true
          )
          false
        )

        ;; Returns participants principals
        (try! 
          (as-contract? ((with-stx total-participants-delegations))
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
        (var-set sponsor-amount u0)

        ;; Action Log (pot + stackspots)
        (let (
            (payload (unwrap-panic (to-consensus-buff? {
              event: "cancel-pot",
              pot-cancelled: (var-get pot-cancelled),
              pot-value: total-delgations,
              pot-participants-count: (var-get last-pot-participant),
            })))
          )
          (print payload)
          (try! (contract-call? 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspots log-cancel-pot payload))
        )

        ;; Execution complete
        (ok true)
      )
    )

  ;; Function that cancels pot activities, returns all participants STX and attempts to claim any yield if there be any

;; ---------------------------------------------------------------------------

;; Pot initialization and pot registeration  
;; Pre init logging and pot registerations
  (define-constant PRE_INIT_LOG (unwrap-panic (to-consensus-buff? 
    {
      event: "pre-init",
      pot-cycle: (var-get pot-cycle),
      pot-min-amount: (var-get pot-min-amount),
      pot-max-participants: (var-get pot-max-participants),
      pot-name: (var-get pot-name),
      pot-type: pot-type,
      pot-is-init: (var-get initiated),
      pot-admin: pot_admin,
      pot-contract: current-contract,
      pot-owner: tx-sender,
      pot-treasury: pot_treasury_address,
      funding-address: (some (var-get funding-address))
    }
  )))

  (print PRE_INIT_LOG)
  
  (contract-call? 'ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.stackspot-pre-init-logs log-pre-init PRE_INIT_LOG)