;; SIP-009 NFT trait (published as ST2DPQ5XEW2TQJG30E5KAQJES4KR2VP4V3K0MYS7D.nft-trait)
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)
