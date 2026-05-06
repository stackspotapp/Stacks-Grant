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

(define-public (set-pot-contract-hash
        (contract <stackspot-trait>)
        (state bool)
    )
    (let ((hash (unwrap! (contract-hash? (contract-of contract)) ERR_NOT_FOUND)))
        (asserts! (is-admin) ERR_UNAUTHORIZED)
        (map-set allowed-contract-hash hash state)
        (print {
            event: "pot contract hash set",
            hash: hash,
            state: state,
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
(add-update-admin-status 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5 true);; Invariants and tests

;; #[env(simnet)]
(define-map context
    (string-ascii 255)
    { called: uint }
)

;; #[env(simnet)]
(define-public (update-context
        (function-name (string-ascii 100))
        (called uint)
    )
    (ok (map-set context function-name { called: called }))
)

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
        (asserts! (not (is-admin)) (ok false))
        (asserts! (is-err (update-public-pot-deploy-status flag)) (err u941))
        (ok true)
    )
)

;; #[env(simnet)]
(define-read-only (invariant-admin-can-deploy-pot)
    (or
        (not (is-admin))
        (can-deploy-pot)
    )
)

;; #[env(simnet)]
(define-read-only (invariant-non-admin-can-deploy-pot-only-during-public-deploy)
    (let ((public-deploy (var-get public-pot-deploy)))
        (or
            (is-admin)

            (if public-deploy
                (can-deploy-pot)
                (not (can-deploy-pot))
            )
        )
    )
)
