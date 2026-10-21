;; SIP-009 NFT trait (published as ST4KKK958A2BG93J06GE9S9Q80WCCMA7QXW2AFRT.nft-trait)
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)
