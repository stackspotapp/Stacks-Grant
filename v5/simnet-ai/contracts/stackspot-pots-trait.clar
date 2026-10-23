;; title: stackspots-trait
;; version: 1.0.0
;; clarity-version: 6
;; summary: Trait for stackspots pot contracts
;; description: Shared read API implemented by jackpot, sequential, and crowd-fund pots.

(define-trait stackspot-pots-trait (
  (get-pot-participants-list () (response (list 100 (optional {participant: principal, amount: uint})) (list 0 (optional {participant: principal, amount: uint}))))
  (get-sponsors-list () (response (list 100 (optional {participant: principal, amount: uint})) (list 0 (optional {participant: principal, amount: uint}))))
  (get-pot-details () (response 
    {
      pot-participants-count: uint, 
      pot-value: uint, 
      pot-reward-amount: uint, 
      pot-participant-values: (optional {participant: principal, amount: uint}),
      ;;;;  Winner Values
      winners-values: (optional {winner-id: uint, winner-address: principal}),
      ;;;;  Starter Values
      pot-starter-address: (optional principal),
      ;;;;  Claimer Values
      pot-claimer-address: (optional principal),
      pool-config: { join-end: uint, prepare-start: uint, cycle-end: uint, reward-release: uint},
      pot-locked: bool,
      pot-lock-burn-height: uint,
      pot-cancelled: bool,
      is-participant: bool,
      is-sponsor: bool,

      platform-estimated-yield: uint
    }
      uint
    )
  )
))