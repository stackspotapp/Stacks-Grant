;; title: stackspot-sponsor-trait
;; version: 0.1.0
;; summary: Trait for platform sponsor contracts
;; description: Pots call `sponsor-event` at init to mint a ticket for that sponsor.

(use-trait stackspot-pots-trait .stackspot-pots-trait.stackspot-pots-trait)

(define-trait stackspot-sponsor-trait (
  (sponsor-platform (uint uint (list 3 {label: (string-ascii 255), state: bool, required: uint, score: uint})) (response bool uint))
  (claim-sponsor-reward (<stackspot-pots-trait> uint) (response bool uint))
  (sponsor-event (<stackspot-pots-trait>) (response uint uint))
))
