;; title: init-admin
;; version:
;; summary:
;; description:

;; Errors
(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant admin tx-sender)

(define-public (update-contract-hash) 
  (begin
    (asserts! (is-eq tx-sender admin) ERR_UNAUTHORIZED)
    (try! (contract-call? .stackspot-admin set-pot-contract-hash 'ST1CYDSYCSDJ86BJ3MZCPHR9HH362XMCJXQV45Q15.stackspot-jackpot true))
    (try! (contract-call? .stackspot-admin set-pot-contract-hash 'ST1CYDSYCSDJ86BJ3MZCPHR9HH362XMCJXQV45Q15.stackspot-crowdfund true))
    (try! (contract-call? .stackspot-admin set-pot-contract-hash 'ST1CYDSYCSDJ86BJ3MZCPHR9HH362XMCJXQV45Q15.stackspot-sequential-pot true))
    ;; (try! (stx-transfer? u1000000000 tx-sender 'ST140MXYA1DSF1R0VZ5YGGQ5XR9FT5H7YTWVGFMJQ))
    ;; (try! (stx-transfer? u1000000000 tx-sender 'STT4SQP5RC1BFAJEQKBHZMXQ8NQ7G118F0XRWTMV))
    ;; (try! (stx-transfer? u1000000000 tx-sender 'ST2QZEVVWS4XDZYHX511A4P8E964RXXCYJ1T5EGQ8))
    ;; (try! (stx-transfer? u1000000000 tx-sender 'ST3DYF2XMX1D09JSG64DYNNXCJTWAWWS0T1TRJDBH))
    ;; (try! (stx-transfer? u1000000000 tx-sender 'ST1PJ28S5CJF84TZNC1BK214QYNNKNNBF6AKEPT6S))
    ;; (try! (contract-call? .sim-pox-4-multi-pool-v1 set-pool-pox-address (tuple (hashbytes 0x7321b74e2b6a7e949e6c4ad313035b1665095017) (version 0x01))))
    (ok true)
  )
)

(update-contract-hash)