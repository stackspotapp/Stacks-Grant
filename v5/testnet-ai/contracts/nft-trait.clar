;; SIP-009 NFT trait (published as STKGQQXE4TMV1P438CQMKA3TE5YAJ2FKAG1MZ1K4.nft-trait)
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)
