;; SIP-009 NFT trait (published as ST3BSH7YA48AK2PCKCMGNPB4GXT09Y9JVTBCHA0A7.nft-trait)
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)
