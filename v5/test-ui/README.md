# Stackspot Test UI

React harness for **v5/simnet** contracts on **Clarinet devnet**, with **wallet authentication** (Stacks Connect) and a **registry-driven pot dashboard**.

## Features

- **Connect wallet** (Leather, Xverse, etc.) — no mnemonics in `.env`
- **Dashboard** — lists pots from `stackspots` / `stackspot-registry` `"pot registered"` print events
- **Live pot state** — `get-pot-details` per card
- **Pot detail** — all public + read-only functions for the connected user
- **Core contracts** — stackspots, distribute, pool, PoX, sBTC, admin
- **Deploy pot** — wallet-signed publish of sequential / jackpot / crowdfund templates with full source + audit panel
- **Advanced call** — any contract from the deployment manifest

## Run

```bash
# Terminal 1
cd v5/simnet
clarinet devnet start

# Terminal 2
cd v5/test-ui
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:5173 → **Connect wallet** → browse pots or use **Core contracts**.

## Wallet / devnet

- Point your wallet at the local API (`http://localhost:3999`) when using devnet. Transaction network is taken from the wallet (no `VITE_CONNECT_NETWORK` in the app).

## Deploying a pot

1. **Deploy pot** → pick template → review source + AUDIT.md notes → acknowledge → **Deploy via wallet**
2. After confirmation, use **Re-check allowlist** for `is-contract-allowed-hash`
3. Open the new pot → `init-pot` → Core → pool + `register-pot`

Source is loaded from `v5/simnet/contracts/*.clar` (same bytes sent to the chain). SHA-256 shown for off-chain audit logs.

## Registering a pot (flow)

1. Deploy pot contract (or use one from the devnet plan).
2. Call `init-pot` on the pot (pot detail page, connected as deployer).
3. Activate pool: `set-pool-pox-address-active` (Core → Multi-pool).
4. Call `register-pot` on **stackspots** (Core → shortcut form).
5. Refresh dashboard — pot appears from chain events.

## Event source

Registration metadata is parsed from contract print logs:

- Primary: `ST1PQ….stackspots` — `(print { event: "pot registered", … })`
- Also scanned: `stackspot-registry` (buff logs from `log-pot`; same tuple when mirrored)

## Stack

- React 19, Vite 6, Tailwind 4
- `@stacks/connect` v8, `@stacks/transactions` v7
- lucide-react, react-icons
