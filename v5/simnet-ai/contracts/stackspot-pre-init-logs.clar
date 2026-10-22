;; title: stackspot-pre-init-logs
;; version:
;; summary:
;; description:

;; Log pre-init at pot deploy time (before register-pot / NFT mint).
    (define-public (log-pre-init (payload (buff 2048)))
      (begin
        (print payload)
        (ok true)
      )
    )