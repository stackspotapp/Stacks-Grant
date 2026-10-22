;; SIP-009 NFT trait (published as ST1MJ1MZ95GC604Q1HYDK3HEP0S3YP0GK72Y2R13S.nft-trait)
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)
