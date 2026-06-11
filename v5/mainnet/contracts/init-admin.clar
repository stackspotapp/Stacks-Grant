;; title: init-admin
;; version:
;; summary:
;; description:

;; Errors
(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant admin tx-sender)
(define-constant ERR_ALREADY_INITIALIZED (err u1413))

(define-data-var initialized bool false)

(define-public (update-contract-hash) 
  (begin
    (asserts! (is-eq tx-sender admin) ERR_UNAUTHORIZED)
    (asserts! (not (var-get initialized)) ERR_ALREADY_INITIALIZED)
    ;; Set the contract hash for the jackpot, crowdfund, and sequential pot contracts
    (try! (contract-call? .stackspot-admin set-pot-contract-hash 'SPEQDXRT981RXPX3FTKPTJGEKG15V09QNN1968JE.stackspot-jackpot true))
    (try! (contract-call? .stackspot-admin set-pot-contract-hash 'SPEQDXRT981RXPX3FTKPTJGEKG15V09QNN1968JE.stackspot-crowdfund true))
    (try! (contract-call? .stackspot-admin set-pot-contract-hash 'SPEQDXRT981RXPX3FTKPTJGEKG15V09QNN1968JE.stackspot-sequential-pot true))
    (var-set initialized true)
    (ok true)
  )
)

(update-contract-hash)