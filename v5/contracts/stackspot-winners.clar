;; title: stackspot-winners
;; version:
;; summary:
;; description:

(define-constant ERR_UNAUTHORIZED (err u1101))

(define-read-only (log-winner (winner-values (buff 250000)))
  (begin
    (asserts! (is-eq contract-caller .stackspot-distribute) ERR_UNAUTHORIZED)
    (print winner-values)
    (ok true)
  )
)
