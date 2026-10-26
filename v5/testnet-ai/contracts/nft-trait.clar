;; SIP-009 NFT trait (published as ST4XX3AP97A00FD0EPAAPSHGS1NM1RHP162A3WT3.nft-trait)
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)
