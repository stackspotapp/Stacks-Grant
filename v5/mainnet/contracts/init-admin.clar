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
    (try! (contract-call? .stackspot-admin set-pot-contract-hash 'SP3BRVGWXWWE92AHXRDPZM855BJ9Q8DXCQSTA9J1Y.stackspot-jackpot true))
    (try! (contract-call? .stackspot-admin set-pot-contract-hash 'SP3BRVGWXWWE92AHXRDPZM855BJ9Q8DXCQSTA9J1Y.stackspot-crowdfund true))
    (try! (contract-call? .stackspot-admin set-pot-contract-hash 'SP3BRVGWXWWE92AHXRDPZM855BJ9Q8DXCQSTA9J1Y.stackspot-sequential-pot true))
    (var-set initialized true)
    (ok true)
  )
)

(update-contract-hash)