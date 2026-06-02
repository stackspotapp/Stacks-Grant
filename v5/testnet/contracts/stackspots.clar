;; title: stackspots
;; version:
;; summary:
;; description:

(impl-trait 'ST1C5022X28DRM7PVNG94YY1VXFHZZKCNBQPMHXJT.nft-trait.nft-trait)
(use-trait stackspot-trait .stackspot-trait.stackspot-trait)

;; Platform address
(define-constant platform-treasury 'STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6)
(define-read-only (get-platform-treasury) platform-treasury)

;; Core errors
(define-constant ERR_ADMIN_ONLY (err u1102))
(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant ERR_NOT_FOUND (err u1001))
(define-constant ERR_INSUFFICIENT_BALANCE (err u1301))
(define-constant ERR_INVALID_ARGUMENT_VALUE (err u1202))
(define-constant ERR_MINT_FAILED (err u1106))
(define-constant ERR_DISPATCH_FAILED (err u1108))
(define-constant ERR_MINT_FEE_TRANSFER_FAILED (err u1109))
(define-constant ERR_UNAUTHORIZED_CONTRACT_HASH (err u1110))

;; NFT errors
(define-constant ERR_NOT_PERMITTED (err u203))

;; NFT Declaration
(define-non-fungible-token stackpot-pot uint)
(define-map pot-contract-with-index principal uint)
(define-map pot-id-info uint
  {
    pot-id: uint,
    pot-name: (string-ascii 255),
    pot-owner: principal,
    pot-contract: principal,
  }
)

;; NFT variables
(define-data-var last-pot-index uint u0)

;; Core actions
(define-data-var fee uint u100000)
(define-public (update-fee (newfee uint))
  (begin
    (asserts! (is-eq tx-sender platform-treasury) ERR_ADMIN_ONLY)
    (ok (var-set fee newfee))
  )
)
(define-read-only (get-fee)
  (var-get fee)
)

(define-public (register-pot (pot-values {owner: principal, contract: principal,  cycles: uint,  type: (string-ascii 255),  pot-reward-token: (string-ascii 16),  min-amount: uint, max-participants: uint}) (contract <stackspot-trait>))
  (let (
      ;; Pot Deploy Values
      (owner (get owner pot-values))
      (contract-address (get contract pot-values))
      (pot-cycles (get cycles pot-values))
      (type (get type pot-values))
      (pot-reward-token (get pot-reward-token pot-values))
      (min-amount (get min-amount pot-values))
      (max-participants (get max-participants pot-values))
      (contract-hash (unwrap! (contract-hash? contract-address) ERR_NOT_FOUND))
      (contract-info (unwrap! (principal-destruct? contract-address) ERR_NOT_FOUND))
      (contract-name (get name contract-info))
      (new-pot-owner-balance (stx-get-balance owner))
      (platform-contracts-fee (var-get fee))
    )
    ;; Validate's if the contract hash is registered or logged by admin as true
    ;; Validate's if the owner has sufficient balance
    ;; Validate's if the owner is the same as the tx-sender
    ;; Validate's if the contract hash is not empty
    ;; Mint NFT to pot address
    (asserts! (contract-call? .stackspot-admin is-contract-allowed-hash contract-address) ERR_UNAUTHORIZED_CONTRACT_HASH)
    (asserts! (contract-call? .stackspot-admin can-deploy-pot) ERR_UNAUTHORIZED)
    (asserts! (>= new-pot-owner-balance platform-contracts-fee) ERR_INSUFFICIENT_BALANCE)
    (asserts! (is-eq tx-sender owner) ERR_UNAUTHORIZED)
    (asserts! (> (len contract-hash) u0) ERR_INVALID_ARGUMENT_VALUE)
    (asserts! (is-eq (contract-of contract) contract-caller) ERR_UNAUTHORIZED)

    (try! (mint contract-address))
    
    ;; Log pot registered
    (print
      (to-consensus-buff? 
        {
          event: "pot-registered",
          ;; Pot Values
          pot-id: (var-get last-pot-index),
          pot-address: contract-address,
          pot-owner: owner,
          pot-deploy-fee: platform-contracts-fee,
          ;; Pot Config Values
          pot-name: contract-name,
          pot-type: type,
          pot-cycles: pot-cycles,
          pot-reward-token: pot-reward-token,
          pot-min-amount: min-amount,
          pot-max-participants: max-participants,
          ;; Pot Origination Values
          origin-contract-sha-hash: contract-hash,
          stacks-block-height: stacks-block-height,
          burn-block-height: burn-block-height,
        }
      ) 
    )     
    (ok true) 
  )
)

;; Print event
(define-public (pot-deploys (pot-values (optional (buff 2048))))
    (begin
      (print pot-values)
      (ok true)
    )
)

;; NFT actions
(define-read-only (get-last-token-id)
  (ok (var-get last-pot-index))
)

(define-read-only (get-token-uri (token-id uint))
  (ok none)
)

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? stackpot-pot token-id))
)

(define-read-only (get-token-id (owner principal))
  (ok (map-get? pot-contract-with-index owner))
)

;; NFT transfer is disabled
(define-public (transfer (token-id uint) (sender principal) (recipient principal)) ERR_NOT_PERMITTED)

(define-private (mint (recipient principal))
  (let (
      (token-id (+ (var-get last-pot-index) u1))
      (platform-contracts-fee (var-get fee))
      (contract-info (unwrap! (principal-destruct? recipient) ERR_NOT_FOUND))
      (contract-name (get name contract-info))
    )
    ;; Validate's if the recipient is a contract principal and not a just principal
    ;; Validate's if the tx-sender is not the platform treasury
    ;; Validate's if the platform treasury is not the recipient
    (asserts! (is-some contract-name) ERR_UNAUTHORIZED)
    (asserts! (not (is-eq tx-sender platform-treasury)) ERR_UNAUTHORIZED)
    (asserts! (not (is-eq platform-treasury recipient)) ERR_UNAUTHORIZED)

    ;; Transfer fee to platform and Mint NFT to pot address
    ;; Mint NFT to pot address
    (asserts!
      (is-ok (stx-transfer-memo? platform-contracts-fee tx-sender platform-treasury
        (unwrap! (to-consensus-buff? "pot mint") ERR_NOT_FOUND)
      ))
      ERR_MINT_FEE_TRANSFER_FAILED
    )
    (asserts! (is-ok (nft-mint? stackpot-pot token-id recipient)) ERR_MINT_FAILED)

    ;; Save pot contract with index and pot id info in the maps
    (map-insert pot-contract-with-index recipient token-id)
    (map-insert pot-id-info token-id {
      pot-id: token-id,
      pot-name: (unwrap! contract-name ERR_NOT_FOUND),
      pot-owner: recipient,
      pot-contract: recipient,
    })
    (var-set last-pot-index token-id)

    ;; Print event
    (print {
      event: "pot mint",
      contract-name: contract-name,
      recipient: recipient,
      token-id: token-id,
      tx-sender: tx-sender,
      contract-caller: contract-caller,
      platform-contracts-fee: platform-contracts-fee,
    })

    (ok token-id)
  )
)

(define-read-only (get-pot-info (owner principal))
  (let (
      (pot-index (unwrap! (unwrap! (get-token-id owner) ERR_NOT_FOUND) ERR_NOT_FOUND))
      (pot-info (unwrap! (map-get? pot-id-info pot-index) ERR_NOT_FOUND))
    )
    (ok pot-info)
  )
)

(define-public (dispatch-principals (contract <stackspot-trait>))
  (let (
      (pot-info (unwrap! (get-pot-info (contract-of contract)) ERR_NOT_FOUND))
      (pot-contract (get pot-contract pot-info))
    )
    (asserts! (is-eq pot-contract (contract-of contract)) ERR_UNAUTHORIZED)
    (asserts! (is-eq contract-caller (contract-of contract)) ERR_UNAUTHORIZED)

    (try! (contract-call? .stackspot-distribute dispatch-principals contract))  

    (print
      (to-consensus-buff? {
        event: "dispatch-principals",
        pot-id: (get pot-id pot-info),
        participants: (unwrap! (contract-call? contract get-pot-participants) ERR_NOT_FOUND),
        contract: pot-contract,
        tx-sender: tx-sender,
        contract-caller: contract-caller,
      })
    )

    (ok true)
  )
)

(define-public (dispatch-sponsor-principals (contract <stackspot-trait>))
  (let (
      (pot-details (unwrap! (contract-call? contract get-pot-details) ERR_NOT_FOUND))
      (pot-info (unwrap! (get-pot-info (contract-of contract)) ERR_NOT_FOUND))
      (pot-contract (get pot-contract pot-info))
    )
    (asserts! (is-eq pot-contract (contract-of contract)) ERR_UNAUTHORIZED)
    (asserts! (is-eq contract-caller (contract-of contract)) ERR_UNAUTHORIZED)
    
    (try!  (contract-call? .stackspot-distribute dispatch-sponsor-principals contract))

    (print
      (to-consensus-buff? {
        event: "dispatch-sponsor-principals",
        pot-id: (get pot-id pot-info),
        sponsors-addresses: (unwrap! (contract-call? contract get-sponsors-addresses) ERR_NOT_FOUND),
        contract: pot-contract,
        tx-sender: tx-sender,
        contract-caller: contract-caller,
      })
    )

    (ok true)
  )
)

(define-public (dispatch-rewards (contract <stackspot-trait>))
  (let (
      (pot-details (unwrap! (contract-call? contract get-pot-details) ERR_NOT_FOUND))
      (pot-info (unwrap! (get-pot-info (contract-of contract)) ERR_NOT_FOUND))
      (pot-contract (get pot-contract pot-info))
      (pot-yield (get pot-reward-amount pot-details))
    )
    (asserts! (is-eq pot-contract (contract-of contract)) ERR_UNAUTHORIZED)
    (asserts! (is-eq contract-caller (contract-of contract)) ERR_UNAUTHORIZED)

    (try! (contract-call? .stackspot-distribute dispatch-rewards contract))

    (print
      (to-consensus-buff? {
        ;; Pot Values
        event: "dispatch-rewards",
        ;; Pot Round Values
        pot-participants-count: (get pot-participants-count pot-details),
        pot-participants: (unwrap! (contract-call? contract get-pot-participants) ERR_NOT_FOUND),
        pot-value: (get pot-value pot-details),
        pot-yield-amount: pot-yield,
        ;; Winner Values
        winners-values: (unwrap! (get winners-values pot-details) ERR_NOT_FOUND),
        ;; Starter Values
        starter-address: (get pot-starter-address pot-details),
        starter-reward-amount: (/ (* pot-yield u2) u100),
        ;; Claimer Values
        claimer-address: (get pot-claimer-address pot-details),
        claimer-reward-amount: (/ (* pot-yield u2) u100),
        ;; Pot Values
        pot-id: (get pot-id pot-info),
        pot-address: pot-contract,
        pot-owner: (get pot-owner pot-info),
        ;; Pot Config Values
        pot-name: (unwrap! (contract-call? contract get-pot-name) ERR_NOT_FOUND),
        pot-type: (unwrap! (contract-call? contract get-pot-type) ERR_NOT_FOUND),
        pot-cycle: (unwrap! (contract-call? contract get-pot-cycle) ERR_NOT_FOUND),
        pot-reward-token: (unwrap! (contract-call? contract get-pot-reward-token) ERR_NOT_FOUND),
        pot-min-amount: (unwrap! (contract-call? contract get-pot-min-amount) ERR_NOT_FOUND),
        pot-max-participants: (unwrap! (contract-call? contract get-pot-max-participants) ERR_NOT_FOUND),
        ;; Pot Origination Values
        origin-contract-sha-hash: (unwrap! (contract-hash? (contract-of contract)) ERR_NOT_FOUND),
        stacks-block-height: stacks-block-height,
        burn-block-height: burn-block-height,
      })
    )

    (ok true)
  )
)

(define-public (delegate-treasury (contract <stackspot-trait>) (delegate-to principal))
  (let (
      (pot-details (unwrap! (get-pot-info (contract-of contract)) ERR_NOT_FOUND))
      (pot-contract (get pot-contract pot-details))
    )
    (asserts! (is-eq pot-contract (contract-of contract)) ERR_UNAUTHORIZED)
    (asserts! (is-eq contract-caller (contract-of contract)) ERR_UNAUTHORIZED)

    (try! (contract-call? .stackspot-distribute delegate-treasury contract delegate-to))

    (print
      (to-consensus-buff? {
        event: "delegate-treasury",
        treasury-address: pot-contract,
        amount-ustx: (stx-get-balance pot-contract),
        contract: contract,
        delegate-to: delegate-to,
        tx-sender: tx-sender,
        contract-caller: contract-caller,
      })
    )

    (ok true)
  )
)

(define-public (extend-delegate-treasury (contract <stackspot-trait>) (delegate-to principal))
  (let (
      (pot-details (unwrap! (get-pot-info (contract-of contract)) ERR_NOT_FOUND))
      (pot-contract (get pot-contract pot-details))
    )
    (asserts! (is-eq pot-contract (contract-of contract)) ERR_UNAUTHORIZED)
    (asserts! (is-eq contract-caller (contract-of contract)) ERR_UNAUTHORIZED)

    (try! (contract-call? .stackspot-distribute extend-delegate-treasury contract))

    (print
      (to-consensus-buff? {
        event: "extend-delegate-treasury",
        treasury-address: pot-contract,
        amount-ustx: (stx-get-balance pot-contract),
        contract: contract,
        delegate-to: delegate-to,
        tx-sender: tx-sender,
        contract-caller: contract-caller
      })
    )

    (ok true)
  )
)

(define-public (revoke-delegate-treasury (contract <stackspot-trait>))
  (let (
      (pot-details (unwrap! (get-pot-info (contract-of contract)) ERR_NOT_FOUND))
      (pot-contract (get pot-contract pot-details))
    )
    (asserts! (is-eq pot-contract (contract-of contract)) ERR_UNAUTHORIZED)
    (asserts! (is-eq contract-caller (contract-of contract)) ERR_UNAUTHORIZED)  
    
    (try! (contract-call? .stackspot-distribute revoke-delegate-treasury contract))
    
    (print
      (to-consensus-buff? {
        event: "revoke-delegate-treasury",
        treasury-address: pot-contract,
        amount-ustx: (stx-get-balance pot-contract),
        contract: contract,
        tx-sender: tx-sender,
        contract-caller: contract-caller,
      })
    )

    (ok true)
  )
)