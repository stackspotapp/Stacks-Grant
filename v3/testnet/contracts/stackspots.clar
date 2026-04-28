(impl-trait 'STT4SQP5RC1BFAJEQKBHZMXQ8NQ7G118F0XRWTMV.nft-trait.nft-trait)
(use-trait stackspot-trait .stackspot-trait.stackspot-trait)

;; Platform address
(define-constant platform-treasury tx-sender)
(define-read-only (get-platform-treasury) platform-treasury)

;; Core errors
(define-constant ERR_ADMIN_ONLY (err u1102))
(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant ERR_NOT_FOUND (err u1001))
(define-constant ERR_INSUFFICIENT_BALANCE (err u1301))
(define-constant ERR_INVALID_ARGUMENT_VALUE (err u1202))
(define-constant ERR_NOT_CONTRACT_AUDITED (err u1103))
(define-constant ERR_MINT_FAILED (err u1106))
(define-constant ERR_LOG_FAILED (err u1107))
(define-constant ERR_DISPATCH_FAILED (err u1108))
(define-constant ERR_MINT_FEE_TRANSFER_FAILED (err u1109))

;; NFT errors
(define-constant ERR_OWNER_ONLY (err u200))
(define-constant ERR_NOT_TOKEN_OWNER (err u201))
(define-constant ERR_OWNER_NOT_PERMITTED (err u202))
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

(define-public (register-pot (pot-values 
    {
        owner: principal,
        contract: principal,
        cycles: uint,
        type: (string-ascii 255),
        pot-reward-token: (string-ascii 16),
        min-amount: uint,
        max-participants: uint,
        contract-sha-hash: (string-ascii 64),
    }
))
    (let (
            ;; Pot Deploy Values
            (owner (get owner pot-values))
            (contract-address (get contract pot-values))
            (pot-cycles (get cycles pot-values))
            (type (get type pot-values))
            (pot-reward-token (get pot-reward-token pot-values))
            (min-amount (get min-amount pot-values))
            (max-participants (get max-participants pot-values))
            (contract-hash (get contract-sha-hash pot-values))
            (contract-info (unwrap! (principal-destruct? contract-address) ERR_NOT_FOUND))
            (contract-name (get name contract-info))
            (new-pot-owner-balance (stx-get-balance owner))
            (platform-contracts-fee (var-get fee))
        )

        ;; Validate's if the contract is audited
        ;; Validate's if the owner has sufficient balance
        ;; Validate's if the owner is the same as the tx-sender
        ;; Validate's if the contract hash is not empty
        ;; Mint NFT to pot address
        (asserts! (contract-call? .stackspot-admin can-deploy-pot) ERR_UNAUTHORIZED)
        (asserts! (> new-pot-owner-balance platform-contracts-fee) ERR_INSUFFICIENT_BALANCE)
        (asserts! (is-eq tx-sender owner) ERR_UNAUTHORIZED)
        (asserts! (> (len contract-hash) u0) ERR_INVALID_ARGUMENT_VALUE)
        (asserts! (is-ok (mint contract-address)) ERR_MINT_FAILED)

        ;; Log pot registered
        (asserts! 
            (is-ok (log-pot 
                    (unwrap! (to-consensus-buff? 
                                {
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
                        ERR_NOT_FOUND
                    )
                )
            )
            ERR_LOG_FAILED
        )

        ;; Print event
        (print {
            event: "pot registered",
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
        })

        (ok true)
    )
)

(define-private (log-pot (pot-values (buff 2048)))
    (begin
        (asserts! (is-ok (contract-call? .stackspot-registry log-pot pot-values)) ERR_LOG_FAILED)
        (ok true)
    )
)

;; NFT actions
;; TODO: Implement get-token-uri and get-owner
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
   (ok  (map-get? pot-contract-with-index owner))
)

;; NFT transfer is disabled
(define-public (transfer (token-id uint) (sender principal) (recipient principal))
    (begin
        (asserts! false ERR_NOT_PERMITTED)
        (nft-transfer? stackpot-pot token-id sender recipient)
    )
)

(define-public (mint (recipient principal))
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
        (asserts! (not (is-eq tx-sender platform-treasury)) ERR_UNAUTHORIZED)
        (asserts! (not (is-eq platform-treasury recipient)) ERR_UNAUTHORIZED)

        ;; Transfer fee to platform and Mint NFT to pot address
        ;; Mint NFT to pot address
        (asserts! (is-ok (stx-transfer-memo? platform-contracts-fee tx-sender platform-treasury (unwrap! (to-consensus-buff? "pot mint") ERR_NOT_FOUND))) ERR_MINT_FEE_TRANSFER_FAILED)
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
    (let 
        (
            (pot-index (unwrap! (unwrap! (get-token-id owner) ERR_NOT_FOUND) ERR_NOT_FOUND))
            (pot-info (unwrap! (map-get? pot-id-info pot-index) ERR_NOT_FOUND))
        )
        (ok pot-info)
    )
)

(define-public (dispatch-principals (contract <stackspot-trait>))
    (let 
        (
            (pot-detailes (unwrap! (get-pot-info (contract-of contract)) ERR_NOT_FOUND))
            (pot-contract (get pot-contract pot-detailes))
        )

        (asserts! (is-eq pot-contract (contract-of contract)) ERR_UNAUTHORIZED)
        (asserts! (is-eq contract-caller (contract-of contract)) ERR_UNAUTHORIZED)
        (asserts! (is-ok (contract-call? .stackspot-distribute dispatch-principals contract)) ERR_DISPATCH_FAILED)

        (ok true)
    )
)

(define-public (dispatch-rewards (contract <stackspot-trait>))
    (let 
        (
            (pot-detailes (unwrap! (get-pot-info (contract-of contract)) ERR_NOT_FOUND))
            (pot-contract (get pot-contract pot-detailes))
        )

        (asserts! (is-eq pot-contract (contract-of contract)) ERR_UNAUTHORIZED)
        (asserts! (is-eq contract-caller (contract-of contract)) ERR_UNAUTHORIZED)

        (try! (contract-call? .stackspot-distribute dispatch-rewards contract))

        (ok true)
    )
)

(define-public (delegate-treasury (contract <stackspot-trait>) (delegate-to principal))
    (let 
        (
            (pot-detailes (unwrap! (get-pot-info (contract-of contract)) ERR_NOT_FOUND))
            (pot-contract (get pot-contract pot-detailes))
            (is-audited (unwrap! (contract-call? .stackspot-audited-contracts is-audited-contract contract) ERR_NOT_FOUND))
        )

        (asserts! is-audited ERR_NOT_CONTRACT_AUDITED)
        (asserts! (is-eq pot-contract (contract-of contract)) ERR_UNAUTHORIZED)
        (asserts! (is-eq contract-caller (contract-of contract)) ERR_UNAUTHORIZED)

        (try! (contract-call? .stackspot-distribute delegate-treasury contract delegate-to))

        (ok true)
    )
)