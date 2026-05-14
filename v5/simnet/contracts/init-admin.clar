(define-constant ERR_UNAUTHORIZED (err u1101))
(define-constant admin tx-sender)

(define-public (update-contract-hash) 
  (begin
    (asserts! (is-eq tx-sender admin) ERR_UNAUTHORIZED)
    (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-admin set-pot-contract-hash 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-jackpot true))
    (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-admin set-pot-contract-hash 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-crowdfund true))
    (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-admin set-pot-contract-hash 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspot-sequential-pot true))

    ;; (try! (contract-call? .stackspot-jackpot init-pot u1 u100000 u100 "test-001" "stackspot-jackpot"))
    ;; (try! (contract-call? .stackspot-crowdfund init-pot u1 u100000 u100 "test-001" "stackspot-crowdfund" 'STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6))
    ;; (try! (contract-call? .stackspot-sequential-pot init-pot u1 u100000 u100 "test-001" "stackspot-sequential-pot"))

    ;; (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sim-pox-4-multi-pool-v1 set-pool-pox-address (tuple (hashbytes 0x7321b74e2b6a7e949e6c4ad313035b1665095017) (version 0x01))))

    (ok true)
  )
)

(update-contract-hash)