# testnet-ai

Testnet-ready copy of `simnet-ai` (Stackspots PoX-5). Same contracts, rewritten so they can be published on Stacks testnet.

## What changed vs simnet-ai

| Item | simnet-ai | testnet-ai |
| --- | --- | --- |
| Cycle / join windows | `.sim-pox-5 get-pox-info` | boot `'ST000000000000000000002AMW42H.pox-5 get-pox-info` |
| Protocol calls | relative `.stackspots`, `.fastpool`, … | `'ST1C5022X28DRM7PVNG94YY1VXFHZZKCNBQPMHXJT.*` |
| Platform treasury | simnet deployer `ST1PQHQ…` | testnet deployer `ST1C5022…` |
| sBTC | local simnet token | existing `'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token` (not published by this repo) |
| Signer | local `fastpool` | existing `'ST31XHNM0GZ2K978FPP4QA3STNQ73Z8C9G9MJEPK2.signer-manager` |
| PoX staking | local `sim-pox-5` | boot `'ST000000000000000000002AMW42H.pox-5` |

Staking and reward crystallization go through **boot PoX-5** plus that signer-manager. This repo does not publish `fastpool` or `sim-pox-5`. The signer must already be registered on boot PoX-5 (`register-self`). Yield is the testnet sBTC token above.

## Deployer

`ST1C5022X28DRM7PVNG94YY1VXFHZZKCNBQPMHXJT` (same wallet as `v5/testnet`).

Mnemonic lives in `settings/Testnet.toml`. If you use a different wallet, run:

```bash
python3 scripts/qualify-for-deployer.py ST<your-testnet-address>
```

Then regenerate the plan.

## Publish

```bash
clarinet deployments generate --testnet --medium-cost
clarinet deployments apply --testnet
```

`Clarinet.toml` only lists `nft-trait` as a requirement. Adding `pox-5`, `sbtc-token`, or `signer-manager` makes generate/apply walk mainnet `SM3VDXK3….sbtc-registry` and panic.

After generate, confirm `stackspot-sponsor` is **before** `init-admin`. Generate often reverses those two; `init-admin` hashes the sponsor contract at publish time.

`init-admin` is last. Its deploy-time `update-contract-hash` allowlists jackpot, sequential, crowd-fund, and stackspot-sponsor.

## After deploy

1. Fund the deployer with testnet STX **before** apply.
2. Confirm `'ST31XHNM0GZ2K978FPP4QA3STNQ73Z8C9G9MJEPK2.signer-manager` is registered on boot PoX-5 (this repo does not call `register-self`).
3. Third-party pot copies: use sources in `published/` (already qualified to this deployer).

## Layout

```
contracts/     protocol + pot templates (testnet-qualified)
published/     jackpot / sequential / crowd-fund copies for other deployers
deployments/   clarinet testnet plan
settings/      Testnet.toml / Devnet.toml / Mainnet.toml
```
