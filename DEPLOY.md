# Deploying Status

```
GitHub (monorepo)
 ├── web/      ──push──▶  Vercel        status.yourdomain.com   (Next.js frontend)
 ├── server/   ──push──▶  DO droplet    api.yourdomain.com      (scoring API + on-chain publisher)
 └── programs/ ─manual─▶  Solana        devnet → mainnet        (transfer hook)
```

The **frontend** is stateless, so Vercel suits it. The **backend** runs on a droplet because it holds the scorer's private key, keeps a SQLite database, and runs background jobs that publish scores on-chain every 30 seconds and re-score wallets daily. Vercel functions can't do any of those.

---

## 1. GitHub

```bash
unzip status.zip && cd status          # already a git repo with an initial commit
gh repo create status --private --source . --push
# or, without the gh CLI:
#   create an empty private repo on github.com, then:
git remote add origin git@github.com:<you>/status.git
git push -u origin main
```

These files are in `.gitignore` and never get committed: `.env*` files, `deploy/.env`, `deploy/secrets/` and `*.db`.

## 2. Backend on a DigitalOcean droplet

**Create the droplet.** Ubuntu 24.04, Basic, **2 GB RAM / 1 vCPU** (about $12/mo) is plenty to start with. Pick the region closest to your RPC provider and add your SSH key.

**DNS.** Add an `A` record for `api.yourdomain.com` pointing at the droplet's IP.

**Bootstrap** (as root, one time):

```bash
ssh root@<droplet-ip>
curl -fsSL https://raw.githubusercontent.com/<you>/status/main/deploy/setup-droplet.sh -o setup.sh
REPO=git@github.com:<you>/status.git API_DOMAIN=api.yourdomain.com bash setup.sh
```

For a **private** repo, the first run prints a deploy key. Add it under GitHub → repo → Settings → Deploy keys (read-only), then re-run the script.

The script does the following:

- installs Docker and a firewall that only allows ports 22, 80 and 443;
- adds 2 GB of swap;
- creates a `deploy` user;
- clones the repo to `/opt/status`;
- creates `deploy/.env` with a random `INTERNAL_API_KEY`;
- generates the **scorer keypair** at `deploy/secrets/scorer.json`;
- starts the API behind **Caddy**, which gets the HTTPS certificate automatically.

**Configure** `/opt/status/deploy/.env`:

| Variable | Value |
|---|---|
| `CORS_ORIGINS` | your Vercel domains, e.g. `https://status.yourdomain.com,https://status-xyz.vercel.app` |
| `RPC_URL` | Helius RPC URL (devnet first) |
| `HELIUS_API_KEY` | enables real scoring. If empty, the API runs in demo mode |
| `STATUS_PROGRAM_ID` | your deployed program id |
| `ANTHROPIC_API_KEY`, `ROAST_MODEL` | optional AI roasts |

Then run `cd /opt/status/deploy && docker compose up -d`, and check with `curl https://api.yourdomain.com/health`.

`/health` → `publisher.enabled` stays `false` until the on-chain registry exists and names the droplet's scorer key as its authority. The `reason` field tells you which of those is missing. See step 4.

**Useful commands on the droplet**

```bash
cd /opt/status/deploy
docker compose logs -f api          # live logs
docker compose ps                   # status
docker compose restart api
docker compose exec api node -e "console.log('ok')"
# back up the score DB (the on-chain book is the source of truth, but the DB caches results)
docker compose cp api:/data/status.db ./status-$(date +%F).db
```

## 3. Frontend on Vercel

1. In Vercel, go to **Add New → Project**, import the GitHub repo, and set **Root Directory** to `web`. Vercel detects Next.js and the npm workspace.
2. Environment variables (Production, and Preview if you use it):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com` |
| `NEXT_PUBLIC_RPC_URL` | Helius RPC URL (same cluster as the backend) |
| `NEXT_PUBLIC_STATUS_PROGRAM_ID` | your program id |
| `NEXT_PUBLIC_SITE_URL` | `https://status.yourdomain.com` |
| `STATUS_API_KEY` | the `INTERNAL_API_KEY` from the droplet's `.env` |

3. Deploy, then add your domain under Project → Settings → Domains.
4. Add the final Vercel domain to `CORS_ORIGINS` on the droplet. If you want preview deployments to work too, set `CORS_ALLOW_VERCEL_PREVIEWS=true`.

`web/vercel.json` skips Vercel builds when a push only touches `server/`, `programs/` or `deploy/`.

**Why `STATUS_API_KEY`?** The backend rate-limits each IP to 60 requests per minute. Vercel renders score pages from a small set of shared IPs, so it would hit that limit quickly. The shared key lets Vercel through while the public stays limited.

## 4. Solana program + registry (devnet)

The compiled program is committed at `deploy/program/status_hook.so`, so you don't need Rust or Anchor on the droplet. Its program id is the `declare_id!` in `programs/status-hook/src/lib.rs`. The matching **program keypair** stays out of git. Paste it once to `/opt/status/deploy/secrets/program-keypair.json`, then run:

```bash
cd /opt/status && git pull
bash deploy/deploy-devnet.sh
```

The script does the following:

- installs the Solana CLI;
- creates a **deployer** wallet at `deploy/secrets/deployer.json`, which becomes the program's upgrade authority, so **back it up**;
- checks the deployer has enough SOL;
- deploys the program;
- funds the scorer;
- creates the registry and score book;
- points the API at the program.

If the deployer is short on SOL (about 3.8 SOL for a fresh deploy), the script prints its address. Fund it at https://faucet.solana.com and re-run. Every step is skipped if it's already done.

Afterwards, set `NEXT_PUBLIC_STATUS_PROGRAM_ID` on Vercel to the printed id and redeploy. `/health` should then show `publisher.enabled: true`.

**Upgrading the program** after changing the Rust code (on a machine with Solana CLI 2.2+):

```bash
cargo build-sbf --manifest-path programs/status-hook/Cargo.toml
cp target/deploy/status_hook.so deploy/program/      # commit + push, git pull on the droplet, then:
solana -u devnet --keypair deploy/secrets/deployer.json program deploy deploy/program/status_hook.so --program-id <PROGRAM_ID>
```

## 5. Auto-deploy the backend from GitHub

`.github/workflows/deploy-api.yml` SSHes into the droplet and rebuilds when `server/`, `packages/core/`, `deploy/` or the lockfile change on `main`.

```bash
# on your machine: a key just for CI
ssh-keygen -t ed25519 -N "" -f status-ci -C "github-actions"
ssh root@<droplet-ip> "cat >> /home/deploy/.ssh/authorized_keys" < status-ci.pub
```

In the GitHub repo, go to Settings → Secrets and variables → Actions and add:

- Secret `DROPLET_HOST`: the droplet IP
- Secret `DROPLET_SSH_KEY`: the contents of `status-ci` (the private key)
- Variable `API_URL`: `https://api.yourdomain.com` (used for the post-deploy health check)

The workflow runs in a GitHub **environment** called `production`. Create it under Settings → Environments, and optionally add yourself as a required reviewer for deploys.

`.github/workflows/ci.yml` runs on every push and PR. It runs typecheck, lint and builds for the web and server, plus `cargo test` for the program.

## Going to mainnet: checklist

- [ ] Program audited; deploy with a multisig upgrade authority (or make it immutable)
- [ ] `RPC_URL` / `NEXT_PUBLIC_RPC_URL` → mainnet Helius endpoints (paid plan for the scorer's history calls)
- [ ] New registry + score book on mainnet (30k wallets ≈ 7 SOL rent; up to about 300k per 10 MB book)
- [ ] Scorer key: keep only on the droplet, fund it modestly, and rotate it with `set_authority` if it leaks
- [ ] Turn on DigitalOcean droplet backups ($2.40/mo) or snapshot the `api-data` volume
- [ ] Uptime monitor on `https://api.yourdomain.com/health`
