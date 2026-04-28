(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant ERR_NOT_FOUND (err u1001))

(define-public (log-pot (participant-values (buff 250000)))
    (begin
        (asserts! (is-eq contract-caller .stackspots) ERR_UNAUTHORIZED)
        (print participant-values) 
        (ok true)
    )
)