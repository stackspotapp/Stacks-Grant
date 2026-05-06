;; title: stackspot-admin
;; version:
;; summary:
;; description:

;; --- Traits
(use-trait stackspot-trait 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-trait.stackspot-trait)

;; Errors
(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant ERR_NOT_FOUND (err u1001))

(define-map admins
  principal
  bool
)
(define-map allowed-contract-hash
  (buff 32)
  bool
)

(define-constant PRIMARY_ADMIN tx-sender)

(define-data-var public-pot-deploy bool true)

(define-public (add-update-admin-status
    (admin principal)
    (enable bool)
  )
  (begin
    (asserts! (is-eq tx-sender PRIMARY_ADMIN) ERR_UNAUTHORIZED)
    (map-set admins admin enable)
    (print {
      event: "admin added/updated",
      admin: admin,
      enable: enable,
    })
    (ok true)
  )
)

(define-public (update-public-pot-deploy-status (enable bool))
  (begin
    (asserts! (is-admin) ERR_UNAUTHORIZED)
    (var-set public-pot-deploy enable)
    (print {
      event: "public pot deploy status updated",
      enable: enable,
      admin: tx-sender,
    })
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

(define-public (add-pot-contract-hash
    (contract <stackspot-trait>)
    (state bool)
  )
  (let ((hash (unwrap! (contract-hash? (contract-of contract)) ERR_NOT_FOUND)))
    (asserts! (is-admin) ERR_UNAUTHORIZED)
    (map-insert allowed-contract-hash hash state)
    (print {
      event: "pot contract hash added",
      hash: hash,
    })
    (ok true)
  )
)

(define-read-only (is-contract-allowed-hash (contract-address principal))
  (map-get? allowed-contract-hash
    (unwrap! (contract-hash? contract-address) none)
  )
)
;; Initialize admins
(add-update-admin-status tx-sender true)
(add-update-admin-status 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5 true)
;; --- Rendezvous invariants & property tests ---

;; #[env(simnet)]
(define-read-only (invariant-primary-admin-always-enabled)
  (default-to false (map-get? admins PRIMARY_ADMIN))
)

;; #[env(simnet)]
(define-public (test-non-primary-cannot-promote-admin (target principal))
  (begin
    (asserts! (not (is-eq tx-sender PRIMARY_ADMIN)) (ok true))
    (asserts! (is-err (add-update-admin-status target true)) (err u940))
    (ok true)
  )
)

;; #[env(simnet)]
(define-public (test-non-admin-cannot-toggle-public-deploy (flag bool))
  (begin
    (asserts! (not (default-to false (map-get? admins tx-sender))) (ok true))
    (asserts! (is-err (update-public-pot-deploy-status flag)) (err u941))
    (ok true)
  )
)
