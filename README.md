# Status

**Not everyone gets in.** Status is a Solana launchpad with an AI at the door. Every wallet gets a score from 0 to 100, and every token sets a minimum score. A Token-2022 **transfer hook** checks the buyer's score on every transfer. Bots, snipers and serial dumpers bounce.

```
status/                         npm workspaces monorepo
├── programs/status-hook/       Anchor program: transfer hook, score book, gates (Rust)
├── packages/core/              shared TS: AI scorer (Helius → features → score → roast) + on-chain SDK
├── web/                        Next.js 16 frontend → Vercel
├── server/                     Fastify API + on-chain score publisher → DigitalOcean droplet
│   └── scripts/                e2e test, registry setup, bulk publish, keypair generator
├── deploy/                     docker-compose (API + Caddy HTTPS), droplet bootstrap script
└── .github/workflows/          CI + auto-deploy of the API
```

**Deploying:** see [DEPLOY.md](DEPLOY.md). The frontend goes on Vercel, the backend on a DigitalOcean droplet.

## How it works

1. **Scoring (off-chain).** `packages/core/src/score` pulls a wallet's swaps from Helius and works out hold times, flip rate, wallet age and bot patterns. It turns those into a score, a tier and a roast (Claude if configured, otherwise templates).
2. **Publishing (on-chain).** The API server (`server/`) writes scores into the **score book**, a single program-owned hash table holding wallet, score and flags at 34 bytes per wallet.
3. **Enforcement (on-chain).** Each Status token's mint has the TransferHook extension pointing at `status-hook`. On every `transfer_checked`, the hook checks:
   - Is the receiver an exempt pool or curve vault? If so, the transfer is **allowed**, so sells are never blocked.
   - Has the gate's open time passed? If so, it's **allowed**.
   - Is the receiver flagged? If so, it's **rejected** (`Flagged`).
   - Is the score below the minimum? If so, it's **rejected** (`ScoreTooLow`).
   - Is the receiver unscored? Then it's allowed only while their balance stays at or below the probation cap (`NotOnTheList`).
4. **Creators can only loosen.** `loosen_gate` can lower the minimum, raise the probation cap, add exempt vaults or set an earlier opening time. It can never tighten any of them, which is the anti-honeypot guarantee.

### Why one score book instead of a PDA per wallet?

The hook's extra accounts are resolved by whichever client builds the transaction (Axiom, Jupiter, a wallet). A per-wallet account would be derived from the buyer's token account, and on a **first buy** that account doesn't exist yet when the client builds the transaction, so resolution fails. The score book is one fixed address, so it always resolves, and it costs about 5× less rent per wallet. The e2e test covers this case: every buy creates the buyer's account in the same transaction.

## Verified so far

- `cargo test`: 4 unit tests pass (meta list, exempt logic, hash-table probing and capacity).
- `server/scripts/e2e.ts` against `solana-test-validator`: **16/16 pass**. Covered: scored buy, low score, flagged bot, probation within and over the cap, sells always pass, wallet-to-wallet bypass blocked, creator can't tighten, a stranger can't edit the gate, loosening works, batch score publishing, and client and on-chain lookups match.
- A door check costs about **12k compute units**.
- `next build`, `tsc` and `eslint` are clean. All pages were screenshot-checked on desktop and mobile.
- Full loop with the API against a local validator: the score is checked, then queued, then published on-chain, and the page shows "On the list". Rate limit, internal-key bypass and CORS were also checked.

## Run locally

```bash
npm install                                   # installs all workspaces
cp server/.env.example server/.env            # defaults work in demo mode
cp web/.env.example web/.env.local            # set NEXT_PUBLIC_API_URL=http://localhost:8080
npm run dev:server                            # API on :8080
npm run dev:web                               # site on :3000
```

The API runs in demo mode until you add `HELIUS_API_KEY`. It publishes scores on-chain only once `SCORER_KEYPAIR` points at the registry's authority key.

### API

| Route | |
|---|---|
| `GET /health` | mode and publisher state (enabled, book, last error) |
| `GET /v1/score/:wallet` | score, tier, factors, roast, and `onchain: { score, pending, publishedAt }` |
| `GET /v1/stats` | counts of scored, published and per-tier wallets |

Each wallet that gets checked is queued and written to the on-chain score book within about 30 seconds, so **checking your Status is what puts you on the list**.

## Deploy the program (devnet)

Requires Solana CLI 2.2+ and Anchor 0.31.

```bash
# 1. program id: generate a keypair and put its address in
#    declare_id! (lib.rs), Anchor.toml and NEXT_PUBLIC_STATUS_PROGRAM_ID
anchor keys sync
anchor build            # or: cargo build-sbf --manifest-path programs/status-hook/Cargo.toml
anchor deploy --provider.cluster devnet

# 2. registry + score book (30k wallets ≈ 1 MB ≈ 7 SOL rent; up to ~300k per 10 MB)
cd server
RPC_URL=https://api.devnet.solana.com SCORER_PUBKEY=<scorer address> BOOK_CAPACITY=30000 npm run setup-registry

# 3. (optional) bulk-score and publish a list of wallets
HELIUS_API_KEY=... npm run publish-scores -- wallets.txt
```

Then open `/launch`, connect a devnet wallet and launch. A single transaction creates the mint (Token-2022 with the transfer hook and metadata) and the gate.

> `Cargo.lock` pins `blake3 = 1.5.5`, because newer versions need a Rust edition that the Solana platform tools' cargo doesn't support yet.

## Run the e2e test locally

```bash
solana-test-validator --reset --bpf-program CEZg25V3N7Z6Qwe9Zi9sH7xoWjan3JFMN3JeHNpZUaNm target/deploy/status_hook.so
npm run test:e2e
```

## Not built yet (next steps)

- **Bonding curve and graduation.** Right now a launch mints the supply to the creator. The next step is a Status curve program whose vault authority is registered as exempt at launch, followed by migration to a DEX pool that supports transfer hooks (check current support before choosing one). Then add that pool's vault authority with `loosen_gate`.
- **Terminal testing.** Confirm on mainnet that Axiom, Photon and Jupiter routes pass the hook's extra accounts. The design makes resolution possible; each venue still has to support Token-2022 hooks.
- **Scoring depth.** Add bundle and cluster detection from funding sources, links to rugged mints, and sniping measured against token creation time. Also add a scheduled job that re-scores active wallets.
- **Real door log.** Index failed transfers carrying Status error codes to replace the demo feed.
- **Score book sharding** once you go past about 300k wallets, plus an appeal flow for wrongly scored wallets.
- **Security audit before mainnet.** The program handles every transfer of every launched token.

Scores are opinions computed from public data. Tokens with economic features may carry legal obligations depending on where you operate, so get legal advice before launching on mainnet.
