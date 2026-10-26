;; SIP-009 NFT trait (published as ST1YMHC7EF9B5465S817SVGJQ54NGA1TFCNJQDR26.nft-trait)
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)
