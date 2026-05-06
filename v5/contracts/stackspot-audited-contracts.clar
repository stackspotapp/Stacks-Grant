;; title: stackspot-audited-contracts
;; version:
;; summary:
;; description:

(use-trait stackspot-trait .stackspot-trait.stackspot-trait)

(define-map audited-contracts principal bool)

(define-constant ERR_ADMIN_ONLY (err u1102))

(define-public (update-audited-contract (contract <stackspot-trait>) (is-audited bool))
    (begin
        (asserts! (contract-call? .stackspot-admin is-admin) ERR_ADMIN_ONLY)
        (ok (map-set audited-contracts (contract-of contract) is-audited))
    )
)

(define-public (remove-audited-contract (contract <stackspot-trait>))
    (begin
        (asserts! (contract-call? .stackspot-admin is-admin) ERR_ADMIN_ONLY)
        (ok (map-delete audited-contracts (contract-of contract)))
    )
)

(define-read-only (is-audited-contract (contract <stackspot-trait>))
    (ok (default-to false (map-get? audited-contracts (contract-of contract))))
)

;; --- Rendezvous invariants & property tests ---

;; #[env(simnet)]
(define-public (test-non-admin-cannot-update-audit (contract <stackspot-trait>) (flag bool))
    (begin
        (asserts! (not (contract-call? .stackspot-admin is-admin)) (ok true))
        (asserts! (is-err (update-audited-contract contract flag)) (err u950))
        (ok true)
    )
)

;; #[env(simnet)]
(define-public (test-non-admin-cannot-remove-audit (contract <stackspot-trait>))
    (begin
        (asserts! (not (contract-call? .stackspot-admin is-admin)) (ok true))
        (asserts! (is-err (remove-audited-contract contract)) (err u951))
        (ok true)
    )
)