;; title: stackspot-admin
;; version:
;; summary:
;; description:

;; --- Traits
(use-trait stackspot-trait .stackspot-trait.stackspot-trait)

;; Errors
(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant ERR_NOT_FOUND (err u1001))

(define-map admins principal bool)
(define-map allowed-contract-hash (buff 32) bool)

(define-constant PRIMARY_ADMIN tx-sender)

(define-data-var public-pot-deploy bool true)
(define-fungible-token sec)

(define-public (add-update-admin-status (admin principal) (enable bool))
  (begin
    (asserts! (or (is-eq tx-sender PRIMARY_ADMIN) (is-admin)) ERR_UNAUTHORIZED)
    (map-set admins admin enable)
    (try! (ft-mint? sec u1 tx-sender))
    (try! (ft-burn? sec u1 tx-sender))
    (print (to-consensus-buff? {
      event: "admin added/updated",
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
      event: "public pot deploy status updated",
      enable: enable,
      admin: tx-sender,
    }))
    (ok true)
  )
)

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

(define-public (set-pot-contract-hash (contract <stackspot-trait>) (state bool))
  (let ((hash (unwrap! (contract-hash? (contract-of contract)) ERR_NOT_FOUND)))
    (asserts! (is-admin) ERR_UNAUTHORIZED)
    (map-set allowed-contract-hash hash state)
    (try! (ft-mint? sec u1 tx-sender))
    (try! (ft-burn? sec u1 tx-sender))
    (print (to-consensus-buff? {
      event: "pot contract hash set",
      hash: hash,
      state: state,
    }))
    (ok true)
  )
)

(define-read-only (is-contract-allowed-hash (contract-address principal))
  (default-to false
    (map-get? allowed-contract-hash
      (unwrap! (contract-hash? contract-address) false)
    ))
)
;; Initialize admins
(add-update-admin-status tx-sender true)
(add-update-admin-status 'SPEQDXRT981RXPX3FTKPTJGEKG15V09QNN1968JE true)
(add-update-admin-status 'SP3WAR3N1XRR139DXCGPR1ATPK2VN63PGRXTD537N true)
(add-update-admin-status 'SPT4SQP5RC1BFAJEQKBHZMXQ8NQ7G118F335BD85 true)
(add-update-admin-status 'SPN4Y5QPGQA8882ZXW90ADC2DHYXMSTN8VAR8C3X true)