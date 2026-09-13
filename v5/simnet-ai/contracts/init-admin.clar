;; title: init-admin
;; version: 1.0.0
;; summary: One-shot allowlist of pot template contract hashes
;; description: Call after stackspots + pot templates are deployed.

(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant admin tx-sender)
(define-constant ERR_ALREADY_INITIALIZED (err u1413))

(define-data-var initialized bool false)

(define-public (update-contract-hash)
  (begin
    (asserts! (is-eq tx-sender admin) ERR_UNAUTHORIZED)
    (asserts! (not (var-get initialized)) ERR_ALREADY_INITIALIZED)
    ;; Allow jackpot, crowd-fund, and sequential pot templates
    (try! (contract-call? .stackspots set-pot-contract-hash .jackpot true))
    (try! (contract-call? .stackspots set-pot-contract-hash .crowd-fund true))
    (try! (contract-call? .stackspots set-pot-contract-hash .sequential true))
    ;; Publish dependency so simnet allowlists `.stackspot-sponsor` after it exists.
    (try! (contract-call? .stackspots update-platform-sponsor-contract .stackspot-sponsor true))
    (var-set initialized true)
    (ok true)
  )
)

(update-contract-hash)