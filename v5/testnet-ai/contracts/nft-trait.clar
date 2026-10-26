;; SIP-009 NFT trait (published as ST2D3MNSY0ZR66G8CD1HQQY8VWY6RZ3BK6CA8E03G.nft-trait)
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)
