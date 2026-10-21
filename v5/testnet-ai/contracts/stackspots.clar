;; title: stackspots
;; version: 1.0.0
;; summary: Core logger + admin controller for stackspots pots
;; description: Registers pots (NFT + event log), validates allowed contract hashes,
;;and manages admin / public-deploy gates. Staking and payouts live on pot contracts.

(impl-trait .nft-trait.nft-trait)
(use-trait stackspot-pots-trait .stackspot-pots-trait.stackspot-pots-trait)

;; Platform treasury (receives mint fees + royalty)
(define-constant PLATFORM_TREASURY current-contract) ;; this is to be update in later time
(define-read-only (get-platform-treasury) PLATFORM_TREASURY)

;; Constants
  ;; Errors
    (define-constant ERR_ADMIN_ONLY (err u1102))
    (define-constant ERR_UNAUTHORIZED (err u1101))
    (define-constant ERR_NOT_FOUND (err u1001))
    (define-constant ERR_INSUFFICIENT_BALANCE (err u1301))
    (define-constant ERR_INVALID_ARGUMENT_VALUE (err u1202))
    (define-constant ERR_UNAUTHORIZED_CONTRACT_HASH (err u1110))
    (define-constant ERR_NOT_PERMITTED (err u203))
;; ---------------------------------------------------------------------------

;; NFT and FT declarations
  ;; NFT Declaration for pots assignments
  (define-non-fungible-token stackpot-pot uint)
  ;; FT used so admin writes leave a clear on-chain footprint
  (define-fungible-token sec)
;; ---------------------------------------------------------------------------

;; Map storage declarations
  (define-map pot-contract-with-index principal uint)
  (define-map pot-id-info uint {pot-id: uint, pot-name: (string-ascii 255), pot-owner: principal, pot-contract: principal})    
  ;; Admin maps
    (define-map admins principal bool)
    (define-map allowed-contract-hash (buff 32) bool)  
    (define-map plaform-sponsor-contracts (buff 32) bool)
;; ---------------------------------------------------------------------------

  ;; Variables
    (define-data-var last-pot-index uint u0)
    (define-data-var minimum-sponsor-amount uint u10000000)
    (define-data-var public-pot-deploy bool true)
    (define-data-var fee uint u100000)
  ;; ---------------------------------------------------------------------------

;; Admin + contract-hash gate (merged from former stackspot-admin)   
  ;; Admin public functions
    (define-public (add-update-admin-status (admin principal) (enable bool))
      (begin
        (asserts! (is-admin) ERR_UNAUTHORIZED)

        (map-set admins admin enable)

        (try! (ft-mint? sec u1 tx-sender))
        (try! (ft-burn? sec u1 tx-sender))

        (print (to-consensus-buff? {
          event: "add-update-admin-status",
          updated-by-admin: tx-sender,
          admin: admin,
          enable: enable,
        }))

        (ok true)
      )
    )

    (define-public (update-public-pot-deploy-status (enable bool))
      (begin
        (asserts! (is-admin) ERR_UNAUTHORIZED)

        (var-set public-pot-deploy enable)

        (try! (ft-mint? sec u1 tx-sender))
        (try! (ft-burn? sec u1 tx-sender))

        (print (to-consensus-buff? {
          event: "update-public-pot-deploy-status",
          updated-by-admin: tx-sender,
          enable: enable,
        }))

        (ok true)
      )
    )

    (define-public (set-pot-contract-hash (contract <stackspot-pots-trait>) (state bool))
      (let 
        (
          (hash (unwrap! (contract-hash? (contract-of contract)) ERR_NOT_FOUND))
        )
        (asserts! (is-admin) ERR_UNAUTHORIZED)

        (map-set allowed-contract-hash hash state)

        (try! (ft-mint? sec u1 tx-sender))
        (try! (ft-burn? sec u1 tx-sender))

        (print (to-consensus-buff? {
          event: "set-pot-contract-hash",
          updated-by-admin: tx-sender,
          hash: hash,
          state: state,
        }))

        (ok true)
      )
    )

    (define-public (update-fee (new-fee uint))
      (begin
        (asserts! (is-admin) ERR_UNAUTHORIZED)
        (asserts! (> new-fee u0) ERR_ADMIN_ONLY)

        (print (to-consensus-buff? {
          event: "update-fee",
          updated-by-admin: tx-sender,
          old-amount: (var-get fee),
          new-amount: new-fee
        }))

        (ok (var-set fee new-fee))
      )
    )

    (define-public (update-minimum-sponsor-amount (amount uint))
      (begin
        (asserts! (is-admin) ERR_UNAUTHORIZED)

        (print (to-consensus-buff? {
          event: "update-minimum-sponsor-amount",
          updated-by-admin: tx-sender,
          old-amount: (var-get minimum-sponsor-amount),
          new-amount: amount
        }))

        (ok (var-set minimum-sponsor-amount amount))
      )
    )

    (define-public (update-platform-sponsor-contract (contract-address principal) (state bool))
      (let 
        (
          (hash (unwrap! (contract-hash? contract-address) ERR_NOT_FOUND))
        )
        (asserts! (is-admin) ERR_UNAUTHORIZED)

        (map-set plaform-sponsor-contracts hash state)

        (print (to-consensus-buff? {
          event: "update-platform-sponsor-contract",
          updated-by-admin: tx-sender,
          contract-address: contract-address,
          hash: hash
        }))

        (ok true)
      )
    )
;; -------------------------Admin Ends------------------------------------------

;; Read only functions
  (define-read-only (is-admin)
    (default-to false (map-get? admins tx-sender))
  )

  (define-read-only (can-deploy-pot)
    (let (
        (caller-is-admin (is-admin))
        (is-public-pot-deploy-enabled (var-get public-pot-deploy))
      )
      (or caller-is-admin is-public-pot-deploy-enabled)
    )
  )

  (define-read-only (is-contract-allowed-hash (contract-address principal))
    (default-to false (map-get? allowed-contract-hash (unwrap! (contract-hash? contract-address) false)))
  )

  (define-read-only (get-fee)
    (var-get fee)
  )

  (define-read-only (get-minimum-sponsor-amount) 
    (var-get minimum-sponsor-amount)
  )

  (define-read-only (validate-platform-sponsor-contract (contract-address principal)) 
    (let 
      (
        (hash (unwrap! (contract-hash? contract-address) false))
      )
      (default-to false (map-get? plaform-sponsor-contracts hash))
    )
  )

  (define-read-only (get-pot-info (owner principal))
    (let
      (
        (pot-index (unwrap! (unwrap! (get-token-id owner) ERR_NOT_FOUND) ERR_NOT_FOUND))
        (pot-info (unwrap! (map-get? pot-id-info pot-index) ERR_NOT_FOUND))
      )
      (ok pot-info)
    )
  )
;; ---------------------------------------------------------------------------

;; Public Functions
  ;; Dynamic Sponsor contract validations enabler
    (define-public (verify-sponsorer-contract (contract-address principal))
      (begin
        (asserts! (is-eq contract-caller contract-address) ERR_NOT_PERMITTED)
        (asserts! (validate-platform-sponsor-contract contract-caller) ERR_UNAUTHORIZED_CONTRACT_HASH)
        (asserts! (> (stx-get-balance contract-address) (get-minimum-sponsor-amount)) ERR_INSUFFICIENT_BALANCE)
        
        (ok true)
      )
    )

  ;; Register pot
    (define-public (register-pot (pot-values (buff 2048)) (contract <stackspot-pots-trait>))
      (let (
          (decoded (unwrap! (from-consensus-buff? {
            event: (string-ascii 255),
            owner: principal,
            contract: principal,
            cycles: uint,
            type: (string-ascii 255),
            pot-reward-token: (string-ascii 16),
            min-amount: uint,
            max-participants: uint,
            sponsors: (list 5 (response {sponsor-contract: principal, ticket-id: uint} {sponsor-contract: principal, ticket-id: uint}))
          } pot-values) ERR_INVALID_ARGUMENT_VALUE))
          ;; Pot Deploy Values
          (owner (get owner decoded))
          (contract-address (get contract decoded))
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
        (asserts! (is-contract-allowed-hash contract-address) ERR_UNAUTHORIZED_CONTRACT_HASH)
        (asserts! (can-deploy-pot) ERR_UNAUTHORIZED)
        (asserts! (>= new-pot-owner-balance platform-contracts-fee) ERR_INSUFFICIENT_BALANCE)
        (asserts! (is-eq tx-sender owner) ERR_UNAUTHORIZED)
        (asserts! (> (len contract-hash) u0) ERR_INVALID_ARGUMENT_VALUE)
        (asserts! (is-eq (contract-of contract) contract-caller) ERR_UNAUTHORIZED)

        (try! (mint contract-address))
        
        ;; Log pot registered. `pot-values` is the caller buff so extra encoded fields stay intact.
        (print
          (to-consensus-buff? 
            {
              event: "register-pot",
              pot-id: (var-get last-pot-index),
              pot-address: contract-address,
              pot-owner: owner,
              pot-deploy-fee: platform-contracts-fee,
              pot-name: contract-name,
              origin-contract-sha-hash: contract-hash,
              stacks-block-height: stacks-block-height,
              burn-block-height: burn-block-height,
              pot-values: pot-values,
            }
          ) 
        )     
        (ok true) 
      )
    )

  ;; Pot action logging
  ;; Pots serialize their own event tuples with `to-consensus-buff?` and pass
  ;; `(buff 2048)`. Stackspots only authenticates the caller and prints.
  ;; Log pre-init at pot deploy time (before register-pot / NFT mint).
    (define-public (log-pre-init (payload (buff 2048)))
      (emit-log payload false)
    )

    (define-public (log-join-pot (payload (buff 2048)))
      (emit-log payload true)
    )

    (define-public (log-join-pot-as-sponsor (payload (buff 2048)))
      (emit-log payload true)
    )

    (define-public (log-start-pot (payload (buff 2048)))
      (emit-log payload true)
    )

    (define-public (log-claim-pot-reward (payload (buff 2048)))
      (emit-log payload true)
    )

    (define-public (log-cancel-pot (payload (buff 2048)))
      (emit-log payload true)
    )

    (define-public (log-fall-back-cancel (payload (buff 2048)))
      (emit-log payload true)
    )

    (define-public (log-sponsor-platform (payload (buff 2048)))
      (emit-sponsor-log payload)
    )
;; ---------------------------------------------------------------------------

;; NFT actions
  ;;NFT Read only function
    (define-read-only (get-last-token-id)
      (ok (var-get last-pot-index))
    )

    (define-read-only (get-token-uri (token-id uint))
      (ok (some "https://stackspot.app/metadata.json"))
    )

    (define-read-only (get-owner (token-id uint))
      (ok (nft-get-owner? stackpot-pot token-id))
    )

    (define-read-only (get-token-id (owner principal))
      (ok (map-get? pot-contract-with-index owner))
    )  

  ;; NFT Public Function
    (define-public (transfer (token-id uint) (sender principal) (recipient principal)) ERR_NOT_PERMITTED)
  
;; ---------------------------------------------------------------------------

;; Private Functions
  (define-private (mint (recipient principal))
    (let 
      (
        (token-id (+ (var-get last-pot-index) u1))
        (platform-contracts-fee (var-get fee))
        (contract-info (unwrap! (principal-destruct? recipient) ERR_NOT_FOUND))
        (contract-name (get name contract-info))
      )
      ;; Validate's if the recipient is a contract principal and not a just principal
      ;; Validate's if the tx-sender is not the platform treasury
      ;; Validate's if the platform treasury is not the recipient
      (asserts! (is-some contract-name) ERR_UNAUTHORIZED)
      (asserts! (not (is-eq tx-sender current-contract)) ERR_UNAUTHORIZED)
      (asserts! (not (is-eq contract-caller current-contract)) ERR_UNAUTHORIZED)

      ;; Transfer fee to platform and Mint NFT to pot address
      ;; Mint NFT to pot address
      (try! (stx-transfer-memo? platform-contracts-fee tx-sender PLATFORM_TREASURY (unwrap! (to-consensus-buff? "pot mint") ERR_NOT_FOUND)))
      (try! (nft-mint? stackpot-pot token-id recipient))

      ;; Save pot contract with index and pot id info in the maps
      (map-insert pot-contract-with-index recipient token-id)
      (map-insert pot-id-info token-id {pot-id: token-id, pot-name: (unwrap! contract-name ERR_NOT_FOUND), pot-owner: recipient, pot-contract: recipient})

      (var-set last-pot-index token-id)

      ;; Print event
      (print (to-consensus-buff? {
        event: "pot mint",
        contract-name: contract-name,
        recipient: recipient,
        token-id: token-id,
        tx-sender: tx-sender,
        contract-caller: contract-caller,
        platform-contracts-fee: platform-contracts-fee,
      }))

      (ok token-id)
    )
  )

  (define-private (get-registered-pot-id (pot principal))
    (ok (unwrap! (unwrap! (get-token-id pot) ERR_NOT_FOUND) ERR_NOT_FOUND))
  )

  (define-private (assert-log-caller (require-registered bool))
    (begin
      (asserts! (is-contract-allowed-hash contract-caller) ERR_UNAUTHORIZED_CONTRACT_HASH)

      (if require-registered
        (begin
          (try! (get-registered-pot-id contract-caller))
          (ok true)
        )
        (ok true)
      )
    )
  )

  (define-private (emit-log (payload (buff 2048)) (require-registered bool))
    (begin
      (try! (assert-log-caller require-registered))
      (print payload)
      (ok true)
    )
  )

  (define-private (emit-sponsor-log (payload (buff 2048)))
    (begin
      (asserts! (validate-platform-sponsor-contract contract-caller) ERR_UNAUTHORIZED_CONTRACT_HASH)
      (print payload)
      (ok true)
    )
  )
;; ---------------------------------------------------------------------------

;; Initialize primary admin

(map-set admins tx-sender true)
(add-update-admin-status tx-sender true)