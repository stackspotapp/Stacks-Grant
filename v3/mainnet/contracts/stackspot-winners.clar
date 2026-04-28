(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant ERR_NOT_FOUND (err u1001))

(define-public (log-winner (winner-values (buff 250000)))
    (begin
        (asserts! (is-eq contract-caller .stackspot-distribute) ERR_UNAUTHORIZED)
        (print winner-values)
        (ok true)
    )
)