;; SIP-009 NFT trait (published as ST1MYQ9W7PSYX6KQNCZWVHKPJZP4QTKH8G872GD32.nft-trait)
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)
