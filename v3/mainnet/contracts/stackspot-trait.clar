(define-trait stackspot-trait 
    (
        (get-pot-admin () (response principal principal))
        (get-pot-participants () (response (list 100 (optional {participant: principal, amount: uint})) (list 0 (optional {participant: principal, amount: uint}))))
        (get-pot-treasury () (response principal principal))
        (get-pot-id () (response (optional uint) (optional uint)))
        (get-pot-name () (response (string-ascii 255) (string-ascii 255)))
        (get-pot-type () (response (string-ascii 255) (string-ascii 255)))
        (get-pot-cycle () (response uint uint))
        (get-pot-reward-token () (response (string-ascii 16) (string-ascii 16)))
        (get-pot-min-amount () (response uint uint))
        (get-pot-max-participants () (response uint uint))
        (get-pot-origin-contract-sha-hash () (response (string-ascii 64) (string-ascii 64)))
        (get-pot-value () (response uint uint))
        (get-last-participant () (response uint uint))
        (get-by-id-helper (uint) (response (optional {participant: principal, amount: uint}) (optional {participant: principal, amount: uint})))
        (get-pot-details () (response 
            {
                pot-participants-count: uint,
                pot-value: uint,
                pot-reward-amount: uint,
                pot-participant-values: (optional {participant: principal, amount: uint}),
                ;; ;; Winner Values
                winners-values: (optional {
                    winner-id: uint,
                    winner-address: principal,
                }),
                ;; ;; Starter Values
                pot-starter-address: (optional principal),
                ;; ;; Claimer Values
                pot-claimer-address: (optional principal),                
                pool-config: {
                    join-end: uint,
                    prepare-start: uint,
                    cycle-end: uint,
                    reward-release: uint
                },
                pot-locked: bool,
                pot-lock-burn-height: uint,
                pot-cancelled: bool,
                is-joined: (optional uint)
            }            

            uint          
        ))
    )
)