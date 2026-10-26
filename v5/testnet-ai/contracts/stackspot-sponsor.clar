;; title: stackspots-sponsor
;; version: 0.1.0
;; summary: Stackspots Sponsor Contract
;; description: This contract is used to sponsor the Stackspots platform.

;; traits
  (impl-trait 'ST4XX3AP97A00FD0EPAAPSHGS1NM1RHP162A3WT3.nft-trait.nft-trait)
  (impl-trait 'ST4XX3AP97A00FD0EPAAPSHGS1NM1RHP162A3WT3.stackspot-sponsor-trait.stackspot-sponsor-trait)
  (use-trait stackspot-pots-trait 'ST4XX3AP97A00FD0EPAAPSHGS1NM1RHP162A3WT3.stackspot-pots-trait.stackspot-pots-trait)
;; ================================

;; token definitions
  (define-non-fungible-token pot-ticket uint)
;; ================================

;; constants
  ;; errors
    (define-constant err_insufficient_sponsor_balance (err u1301))
    (define-constant err_not_platform_sponsor_contract (err u1302))
    (define-constant err_not_found (err u404))
    (define-constant err_not-authorized (err u1304))
    (define-constant err-not-sufficient-stake-cycles (err u1304))
    (define-constant err_try_again_after_prepare_start (err u1305))
    (define-constant err-not-allowed-contract-hash (err u1305))
    (define-constant err_already_initialized (err u1305))
    (define-constant err_locked (err u1306))

    ;; Fastpool: "A staker tried to claim rewards, but they had none available"
    ;; PoX-5: distribution already computed for this window
      (define-constant FASTPOOL_ERR_NO_CLAIMABLE_REWARDS u1001)
      (define-constant POX5_ERR_DISTRIBUTION_ALREADY_COMPUTED u30)
    ;; ---
  ;; data constants vars
    (define-constant sponsorer tx-sender)
    (define-constant stake-amount u40000000)
    (define-constant signer 'ST31XHNM0GZ2K978FPP4QA3STNQ73Z8C9G9MJEPK2.signer-manager)
    (define-constant rule-sets-count u3)

    (define-constant pox-data (contract-call? 'ST000000000000000000002AMW42H.pox-5 get-pox-info))
    (define-constant pox-details (unwrap! pox-data err_not_found))

  ;; data variables
    (define-data-var lock-burn-height (optional uint) none)
    (define-data-var num-cycles uint u10)
  
  (define-data-var initialized bool false)
;; ================================

;; data maps
  (define-map rule-set uint {label: (string-ascii 255), state:bool, required: uint, score: uint})

  ;; Track PoX-5 stake metadata for claim timing / reward attribution
    (define-map staked-cycles uint uint)
;; ================================

;; public functions
  (define-public (sponsor-platform (amount uint) (cycles uint) (logo-url (string-ascii 256)) (description (string-ascii 256)) (rule-list (list 3 {label: (string-ascii 255), state: bool, required: uint, score: uint}))) 
    (let
      (
        (is-staking (> (get locked (stx-account current-contract)) u0))
        (prepare-window (get prepare-start (unwrap! (get-pool-config (default-to burn-block-height (var-get lock-burn-height))) err_not_found)))
      ) 
        (asserts! (< burn-block-height prepare-window) err_try_again_after_prepare_start)
        (asserts! (>= amount (get-minimum-sponsor-amount)) err_insufficient_sponsor_balance)
        (asserts! (> cycles u0) err-not-sufficient-stake-cycles)

        ;; validate the sponsor contract is allowed to sponsor
        (try! (contract-call? 'ST4XX3AP97A00FD0EPAAPSHGS1NM1RHP162A3WT3.stackspots verify-sponsorer-contract current-contract))
        (try! (stx-transfer-memo? amount tx-sender current-contract (unwrap! (to-consensus-buff? "sponsor amount transferred") err_not_found)))
        
        ;; stake or stake-update in pox-5
        (if is-staking
          (begin
            (try! (as-contract? ((with-staking amount)) (try! (contract-call? 'ST000000000000000000002AMW42H.pox-5 stake-update signer signer cycles amount none))))
            true        
          )
          (begin
            (try! (as-contract? ((with-staking amount)) (try! (contract-call? 'ST000000000000000000002AMW42H.pox-5 stake signer amount cycles burn-block-height none))))
            true
          )
        )

        ;; update rule-set
        (try! (init-rules rule-list))

        ;; set num-cycles
        (var-set num-cycles cycles)
        (var-set lock-burn-height (some burn-block-height))

        ;; Action log (stackspots)
        (let 
          (
            (payload (unwrap! (to-consensus-buff? {
              event: "sponsor-platform",
              amount: amount,
              cycles: cycles,
              logo-url: logo-url,
              description: description,
              rule-list: rule-list,
              sponsor: tx-sender,
              sponsor-contract: current-contract,
              burn-block-height: burn-block-height,
            }) err_not_found))
          )
          (print payload)
          (try! (contract-call? 'ST4XX3AP97A00FD0EPAAPSHGS1NM1RHP162A3WT3.stackspots log-sponsor-platform payload))          
        )

        (ok true)
    )
  )

  (define-public (claim-sponsor-reward (pot-contract <stackspot-pots-trait>) (ticket-id uint))
    (let 
      (
        (sbtc-yield (unwrap-panic (contract-call? 'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token get-balance current-contract)))
        (is-locked (> (get locked (stx-account current-contract)) u0))
        (memo (to-consensus-buff? "claim-sponsor-reward"))
        (total-score (unwrap-panic (get-total-validated-rule-score pot-contract)))
        (reward-amount (if (<= total-score sbtc-yield) total-score sbtc-yield))
        (sponsored-amount (stx-get-balance current-contract))
        (token-id-owner (unwrap-panic (unwrap-panic (get-owner ticket-id))))
      )
      (asserts! (contract-call? 'ST4XX3AP97A00FD0EPAAPSHGS1NM1RHP162A3WT3.stackspots is-contract-allowed-hash (contract-of pot-contract)) err-not-allowed-contract-hash)
      (asserts! (is-eq (contract-of pot-contract) contract-caller) err_not-authorized)
      (asserts! (is-eq token-id-owner contract-caller) err-not-token-owner)

      ;; Ticket is minted to the pot; pots claim via contract-caller
      (if (is-eq (unwrap-panic (nft-get-owner? pot-ticket ticket-id)) contract-caller)
        (begin 
          ;; claim reward if available
          (if (> reward-amount u0) 
            (try! (as-contract? ((with-ft 'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token "sbtc-token" reward-amount)) (try! (contract-call? 'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token transfer reward-amount current-contract (contract-of pot-contract) memo))))
            false
          ) 
          true
        )
        false
      )

      ;; transfer sponsored amount to sponsorer if un-locked
      (if (and (not is-locked) (> sponsored-amount u0))
        (try! (as-contract? ((with-stx sponsored-amount)) (try! (stx-transfer-memo? sponsored-amount current-contract sponsorer (unwrap! memo err_not_found)))))
        false
      )

      (print {
        event: "claim-sponsor-reward",
        ticket-id: ticket-id,
        ticket-owner: contract-caller,
        total-score: total-score,
        reward-amount: (if (<= total-score sbtc-yield) total-score sbtc-yield),
        total-reward-pool: sbtc-yield,
        pot-contract: (contract-of pot-contract),
        burn-block-height: burn-block-height,
      })
      
      (ok true)
    )
  )  

  (define-public (sponsor-event (pot-contract <stackspot-pots-trait>)) 
    (begin
      ;; validate the calling pot is the contract being sponsored
      ;; validate the sponsor contract is allowed to sponsor events
      (asserts! (is-eq contract-caller (contract-of pot-contract)) err_not-authorized)
      (asserts! (contract-call? 'ST4XX3AP97A00FD0EPAAPSHGS1NM1RHP162A3WT3.stackspots is-contract-allowed-hash contract-caller) err_not-authorized)

      (let
        (
          (pot-details (unwrap-panic (contract-call? pot-contract get-pot-details)))
          (ticket-id (try! (mint contract-caller)))
        )
        ;; log the sponsor event
        (print (unwrap! (to-consensus-buff? {
          event: "sponsor-event", 
          ticket-id: ticket-id, 
          pot-contract: (contract-of pot-contract), 
          pot-details: pot-details,
          burn-block-height: burn-block-height,
        }) err_not_found))
        
        (ok ticket-id)
      )
    )
  )

  (define-public (withdraw-principal (amount uint)) 
    (let
      (
        (withdrawable-amount (get unlocked (stx-account current-contract)))
        (is-locked (> (get locked (stx-account current-contract)) u0))
        (memo (to-consensus-buff? "withdraw-principal"))
      )
      (asserts! (is-eq tx-sender sponsorer) err_not-authorized)
      (asserts! (not is-locked) err_locked)
      (asserts! (>= withdrawable-amount amount) err_insufficient_sponsor_balance)
      (try! (as-contract? ((with-stx amount)) (try! (stx-transfer-memo? amount current-contract sponsorer (unwrap! memo err_not_found)))))

      (print {
        event: "withdraw-principal",
        amount: amount,
        withdrawable-amount: withdrawable-amount,
        is-locked: is-locked,
        sponsor: tx-sender,
        sponsor-contract: current-contract,
        burn-block-height: burn-block-height,
      })

      (ok true)
    )
  )

  (define-public (extend-sponsor-platform (cycles uint))
    (let
      (
        (extendable-stake-amount (get unlocked (stx-account current-contract)))
        (is-locked (> (get locked (stx-account current-contract)) u0))
      )
      (asserts! (is-eq tx-sender sponsorer) err_not-authorized)
      (asserts! (not is-locked) err_locked)
      (asserts! (> extendable-stake-amount u0) err_insufficient_sponsor_balance)

      ;; stake or stake-update in pox-5
        (if is-locked
          (begin
            (try! (as-contract? ((with-staking extendable-stake-amount)) (try! (contract-call? 'ST000000000000000000002AMW42H.pox-5 stake-update signer signer cycles extendable-stake-amount none))))
            true        
          )
          (begin
            (try! (as-contract? ((with-staking extendable-stake-amount)) (try! (contract-call? 'ST000000000000000000002AMW42H.pox-5 stake signer extendable-stake-amount cycles burn-block-height none))))
            true
          )
        )


        (print {
          event: "extend-sponsor-platform",
          cycles: cycles,
          extendable-stake-amount: extendable-stake-amount,
          is-locked: is-locked,
          sponsor: tx-sender,
          sponsor-contract: current-contract,
          burn-block-height: burn-block-height,
        })

      (ok true)
    )
  )
;; ================================

;; private helper functions
  (define-private (get-rule (index uint)) (map-get? rule-set index))

  (define-private (get-rule-score (index uint)) (if (default-to false (get state (get-rule index))) (default-to u0 (get score (get-rule index))) u0))

  (define-private (add-score (score uint) (total uint)) (+ total score))

  (define-private (update-rule-loop (rule-values {label: (string-ascii 255), state: bool, required: uint, score: uint}) (index uint)) 
    (begin
      (map-set rule-set index rule-values)
      (+ index u1)
    )
  )

  (define-private (get-total-validated-rule-score (pot-contract <stackspot-pots-trait>)) 
    (let 
      (
        (generated-list (default-to (list ) (contract-call? 'ST4XX3AP97A00FD0EPAAPSHGS1NM1RHP162A3WT3.stackspot-vrf generate-list u0 rule-sets-count)))
        (rule-set-list (map get-rule-score generated-list))
      )
      (ok 
        (fold add-score 
          (list 
            (if (check-rule-0 pot-contract) (unwrap! (element-at? rule-set-list u0) err_not_found) u0)
            (if (check-rule-1 pot-contract) (unwrap! (element-at? rule-set-list u1) err_not_found) u0)
            (if (check-rule-2 pot-contract) (unwrap! (element-at? rule-set-list u2) err_not_found) u0)
          )        
          u0
        )
      )
    )
  )

  (define-private (init-rules (values (list 3 {label: (string-ascii 255), state: bool, required: uint, score: uint}))) 
    (begin
      (asserts! (not (var-get initialized)) err_already_initialized)
      (asserts! (is-eq tx-sender sponsorer) err_not-authorized)

      (fold update-rule-loop values u0)
      
      (ok true)
    )
  )

;; ================================

;; rules check functions
  ;; rule-0: checkes if pot balance meets the required amount for sponsore rewards
  (define-private (check-rule-0 (pot-contract <stackspot-pots-trait>)) (and (>= (stx-get-balance (contract-of pot-contract)) (default-to u0 (get required (get-rule u0)))) (default-to false (get state (get-rule u0)))))
  ;; rule-1: checkes if pot participants meets the required number for sponsore rewards
  (define-private (check-rule-1 (pot-contract <stackspot-pots-trait>)) (and (>= (get pot-participants-count (unwrap! (contract-call? pot-contract get-pot-details) false)) (default-to u0 (get required (get-rule u0)))) (default-to false (get state (get-rule u0)))))
  ;; rule-2: checkes if pot started before the required time window for sponsore rewards
  (define-private (check-rule-2 (pot-contract <stackspot-pots-trait>)) (and (<= (get pot-lock-burn-height (unwrap! (contract-call? pot-contract get-pot-details) false)) (default-to u0 (get required (get-rule u0)))) (default-to false (get state (get-rule u0)))))
;; ================================

;; read only functions
  (define-read-only (get-pool-config (height uint))
    (let (
        (first (get first-burnchain-block-height pox-details))
        (cycle-len (get reward-cycle-length pox-details))
        (prepare-len (get prepare-cycle-length pox-details))
        (cycle (/ (- height first) cycle-len))
        ;; Next reward-cycle boundary after lock (join / prepare window)
        (next-cycle-start (+ first (* (+ cycle u1) cycle-len)))
        ;; PoX-5 unlock height = start of cycle (lock-cycle + 1 + staked-cycles)
        (n (if (is-eq (var-get num-cycles) u0) u1 (var-get num-cycles)))
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

  (define-read-only (get-minimum-sponsor-amount) 
    (contract-call? 'ST4XX3AP97A00FD0EPAAPSHGS1NM1RHP162A3WT3.stackspots get-minimum-sponsor-amount)
  )

  (define-read-only (get-rule-sets) 
    (let 
      (
        (generated-list (default-to (list ) (contract-call? 'ST4XX3AP97A00FD0EPAAPSHGS1NM1RHP162A3WT3.stackspot-vrf generate-list u0 rule-sets-count)))
        (rule-set-list (map get-rule generated-list))
      )
      (ok rule-set-list)
    )
  )

  (define-read-only (get-total-rule-score) 
    (let 
      (
        (generated-list (default-to (list ) (contract-call? 'ST4XX3AP97A00FD0EPAAPSHGS1NM1RHP162A3WT3.stackspot-vrf generate-list u0 rule-sets-count)))
        (rule-set-list (map get-rule-score generated-list))
      )
      (ok (fold add-score rule-set-list u0))
    )
  )

  (define-read-only (get-sponsor-details (values {balance: uint, participant-count: uint, lock-burn-height: uint})) 
    (ok {
      available-reward-pool: (unwrap! (contract-call? 'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token get-balance current-contract) err_not_found),
      is-locked: (> (get locked (stx-account current-contract)) u0),
      sponsored-amount-ustx: (stx-get-balance current-contract),
      rules: (get-rule-sets),
      sponsor: sponsorer,
      contract: current-contract,
      rules-score: (get-total-rule-scored values)
    })
  )

  (define-read-only (get-total-rule-scored (values {balance: uint, participant-count: uint, lock-burn-height: uint})) 
    (let 
      (
        (balance (get balance values))
        (participant-count (get participant-count values))
        (locked-burn-height (get lock-burn-height values))
      ) 
      (fold add-score (list 
        (if (>= balance (default-to u0 (get required (get-rule u0)))) (get-rule-score u0) u0)
        (if (>= participant-count (default-to u0 (get required (get-rule u1)))) (get-rule-score u1) u0)
        (if (< locked-burn-height (default-to u0 (get required (get-rule u2)))) (get-rule-score u2) u0)
      ) u0)
    )
  )
;; ================================

;; NFT logics
;; ================================
  ;; constants
    (define-constant contract-owner tx-sender)
    (define-constant err-owner-only (err u100))
    (define-constant err-not-token-owner (err u101))
  ;; Data vars
    (define-data-var last-token-id uint u0)

  ;; Read only function
    (define-read-only (get-last-token-id)
      (ok (var-get last-token-id))
    )
    (define-read-only (get-token-uri (token-id uint))
      (ok (some "https://stackspot.app/metadata.json"))
    )
    (define-read-only (get-owner (token-id uint))
      (ok (nft-get-owner? pot-ticket token-id))
    )

  ;; Public function
    (define-public (transfer (token-id uint) (sender principal) (recipient principal))
      (begin
        (asserts! false err-not-token-owner)
        (nft-transfer? pot-ticket token-id sender recipient)
      )
    )

    (define-public (mint (recipient principal))
      (let
        (
          (token-id (+ (var-get last-token-id) u1))
        )
        (asserts! (contract-call? 'ST4XX3AP97A00FD0EPAAPSHGS1NM1RHP162A3WT3.stackspots is-contract-allowed-hash recipient) err_not-authorized)
        (asserts! (is-eq tx-sender recipient) err-owner-only)
        
        (try! (nft-mint? pot-ticket token-id recipient))
        (var-set last-token-id token-id)
        (ok token-id)
      )
    )
;; ================================