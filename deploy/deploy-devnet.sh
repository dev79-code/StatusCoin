#!/usr/bin/env bash
# Deploy the Status program to devnet and create the registry + score book.
# Run on the droplet as root:   bash /opt/status/deploy/deploy-devnet.sh
#
# Needs: deploy/program/status_hook.so (in the repo) and
#        deploy/secrets/program-keypair.json (pasted by you — NOT in git).
# Safe to re-run: every step is skipped if already done.
set -euo pipefail
cd "$(dirname "$0")"

RPC="${RPC:-https://api.devnet.solana.com}"
CAPACITY="${BOOK_CAPACITY:-5000}"          # wallets in the score book (5k ≈ 1.2 SOL rent)
SO=program/status_hook.so
PKP=secrets/program-keypair.json
DEPLOYER_KP=secrets/deployer.json
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m%s\033[0m\n' "$*"; exit 1; }

[ -f "$SO" ] || die "missing $SO — run 'git pull' in /opt/status first"
[ -f "$PKP" ] || die "missing $PKP — paste the program keypair first (see instructions)"
[ -f secrets/scorer.pubkey ] || die "missing secrets/scorer.pubkey — run setup-droplet.sh first"

say "1/5 Solana CLI"
if ! command -v solana >/dev/null; then
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
fi
solana --version

PROGRAM_ID=$(solana-keygen pubkey "$PKP")
EXPECTED=$(grep -oP 'declare_id!\("\K[^"]+' ../programs/status-hook/src/lib.rs)
[ "$PROGRAM_ID" = "$EXPECTED" ] || die "program keypair ($PROGRAM_ID) doesn't match declare_id! ($EXPECTED)"
[ -f "$DEPLOYER_KP" ] || solana-keygen new --no-bip39-passphrase -s -o "$DEPLOYER_KP" >/dev/null
chmod 600 "$DEPLOYER_KP" "$PKP"
DEPLOYER=$(solana-keygen pubkey "$DEPLOYER_KP")
SCORER=$(cat secrets/scorer.pubkey)
S="solana -u $RPC --keypair $DEPLOYER_KP"

say "2/5 funds"
deployed() { $S program show "$PROGRAM_ID" >/dev/null 2>&1; }
SO_BYTES=$(stat -c %s "$SO")
lamports_rent() { $S rent "$1" --lamports | awk '/lamports/ {print $(NF-1)}'; }
REGISTRY=$(solana find-program-derived-address "$PROGRAM_ID" string:registry)
NEED=250000000                                                     # scorer funding + tx fees
deployed || NEED=$(( NEED + $(lamports_rent "$SO_BYTES") + 100000000 ))   # program data (+ margin)
$S account "$REGISTRY" >/dev/null 2>&1 || NEED=$(( NEED + $(lamports_rent $((16 + CAPACITY * 34))) ))  # score book
bal() { $S balance "$DEPLOYER" --lamports | awk '{print $1}'; }
if [ "$(bal)" -lt "$NEED" ]; then
  $S airdrop 2 "$DEPLOYER" >/dev/null 2>&1 || true
  sleep 3
  $S airdrop 2 "$DEPLOYER" >/dev/null 2>&1 || true
fi
HAVE=$(bal)
if [ "$HAVE" -lt "$NEED" ]; then
  die "Deployer needs $(awk "BEGIN{print $NEED/1e9}") SOL, has $(awk "BEGIN{print $HAVE/1e9}").
Get devnet SOL at https://faucet.solana.com for this address, then re-run:
   $DEPLOYER"
fi
echo "deployer $DEPLOYER has $(awk "BEGIN{print $HAVE/1e9}") SOL"

say "3/5 program $PROGRAM_ID"
if deployed; then
  echo "already deployed — skipping (upgrade with: $S program deploy $SO --program-id $PROGRAM_ID)"
else
  $S program deploy "$SO" --program-id "$PKP"
fi

say "4/5 scorer + registry + score book"
SCORER_BAL=$($S balance "$SCORER" --lamports | awk '{print $1}')
[ "$SCORER_BAL" -ge 50000000 ] || $S transfer --allow-unfunded-recipient "$SCORER" 0.2 >/dev/null
echo "scorer $SCORER funded"

RUN_ENV=(-e RPC_URL="$RPC" -e STATUS_PROGRAM_ID="$PROGRAM_ID" -e ADMIN_KEYPAIR=/keys/admin.json -e SCORER_PUBKEY="$SCORER" -e BOOK_CAPACITY="$CAPACITY")
SETUP='cp -r /src /w && cd /w && npm ci -w server -w @status/core --include-workspace-root --ignore-scripts --no-audit --no-fund --loglevel=error && cd server && npx tsx scripts/setup-registry.ts'
if [ "${USE_HOST_NODE:-}" = 1 ]; then
  ( export RPC_URL="$RPC" STATUS_PROGRAM_ID="$PROGRAM_ID" ADMIN_KEYPAIR="$PWD/$DEPLOYER_KP" SCORER_PUBKEY="$SCORER" BOOK_CAPACITY="$CAPACITY"
    cd ../server && npx tsx scripts/setup-registry.ts )
else
  docker run --rm -v "$(cd .. && pwd)":/src:ro -v "$PWD/$DEPLOYER_KP":/keys/admin.json:ro "${RUN_ENV[@]}" node:22-slim sh -c "$SETUP"
fi

say "5/5 point the API at the program"
sed -i "s|^STATUS_PROGRAM_ID=.*|STATUS_PROGRAM_ID=$PROGRAM_ID|; s|^RPC_URL=.*|RPC_URL=$RPC|" .env
if [ "${SKIP_COMPOSE:-}" != 1 ]; then
  docker compose up -d
  sleep 8
  curl -s http://127.0.0.1:8090/health || true
fi

cat <<EOF

────────────────────────────────────────────────────────────
 Program   $PROGRAM_ID   (devnet)
 Deployer  $DEPLOYER     (upgrade authority — back up deploy/secrets/deployer.json!)
 Scorer    $SCORER

 Vercel: set NEXT_PUBLIC_STATUS_PROGRAM_ID=$PROGRAM_ID
         and NEXT_PUBLIC_RPC_URL=$RPC, then Redeploy.
 Health should now show "publisher": { "enabled": true }
────────────────────────────────────────────────────────────
EOF
