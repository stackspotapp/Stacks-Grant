;; SIP-009 NFT trait (published as ST2RMQGDHR7BP8YTAH916QMN6CM06PTDZXZ0XJQCQ.nft-trait)
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)
