;; SIP-009 NFT trait (published as ST3RCQ79BSRY80WS98GZF86B48G6JC66TFF8Y4QX0.nft-trait)
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)
