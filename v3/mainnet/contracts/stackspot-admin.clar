(define-constant ERR_UNAUTHORIZED (err u1101))

(define-map admins principal bool)

(define-constant primary-admin tx-sender)

(define-data-var public-pot-deploy bool false)

(define-public (add-update-admin-status (admin principal) (enable bool)) 
    (begin
        (asserts! (is-eq tx-sender primary-admin) ERR_UNAUTHORIZED)
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
        (asserts! (default-to false (map-get? admins tx-sender)) ERR_UNAUTHORIZED)
        (var-set public-pot-deploy enable)
        (print {
            event: "public pot deploy status updated",
            enable: enable,
            admin: tx-sender
        })
        (ok true)
    )
)

(define-read-only (is-admin) 
    (default-to false (map-get? admins tx-sender))
)

(define-read-only (can-deploy-pot) 
   (let     
        (
            (caller-is-admin (default-to false (map-get? admins tx-sender)))
            (is-public-pot-deploy-enabled (var-get public-pot-deploy))
        )
        (or caller-is-admin is-public-pot-deploy-enabled)
   )
)

;; Initialze admin addresses
(add-update-admin-status tx-sender true)
(add-update-admin-status 'SPT4SQP5RC1BFAJEQKBHZMXQ8NQ7G118F335BD85 true)
(add-update-admin-status 'SPN4Y5QPGQA8882ZXW90ADC2DHYXMSTN8VAR8C3X true)
(add-update-admin-status 'SP3WAR3N1XRR139DXCGPR1ATPK2VN63PGRXTD537N true)