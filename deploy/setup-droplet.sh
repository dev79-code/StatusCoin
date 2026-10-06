#!/usr/bin/env bash
# One-time setup for a fresh DigitalOcean droplet (Ubuntu 24.04).
#
#   ssh root@<droplet-ip>
#   curl -fsSL https://raw.githubusercontent.com/<you>/<repo>/main/deploy/setup-droplet.sh -o setup.sh
#   REPO=git@github.com:<you>/<repo>.git API_DOMAIN=api.yourdomain.com bash setup.sh
#
# Safe to re-run. It will:
#   1. install Docker + firewall (22/80/443 only)
#   2. create a `deploy` user (used by GitHub Actions to redeploy)
#   3. create an SSH deploy key so the droplet can pull your private repo
#   4. clone the repo to /opt/status
#   5. create deploy/.env and a scorer keypair (deploy/secrets/scorer.json)
#   6. start the API + Caddy (HTTPS)
set -euo pipefail

REPO="${REPO:?set REPO=git@github.com:<you>/<repo>.git}"
API_DOMAIN="${API_DOMAIN:?set API_DOMAIN=api.yourdomain.com}"
BRANCH="${BRANCH:-main}"
APP_DIR=/opt/status
say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

say "1/6 packages, docker, firewall"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get install -y git curl ufw ca-certificates
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw --force enable
# small droplets: 2G swap keeps docker builds from OOMing
if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi

say "2/6 deploy user"
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys

say "3/6 GitHub deploy key (read-only access for the droplet)"
if [ ! -f /home/deploy/.ssh/github ]; then
  sudo -u deploy ssh-keygen -t ed25519 -N "" -C "status-droplet" -f /home/deploy/.ssh/github >/dev/null
  cat > /home/deploy/.ssh/config <<EOF
Host github.com
  IdentityFile ~/.ssh/github
  StrictHostKeyChecking accept-new
EOF
  chown deploy:deploy /home/deploy/.ssh/config
fi
install -d -o deploy -g deploy "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  if ! sudo -u deploy git clone -b "$BRANCH" "$REPO" "$APP_DIR"; then
    echo
    echo "Couldn't clone. If the repo is private, add this key in GitHub:"
    echo "  Repo → Settings → Deploy keys → Add deploy key (read-only)"
    echo
    cat /home/deploy/.ssh/github.pub
    echo
    echo "Then re-run this script."
    exit 1
  fi
fi

say "4/6 environment"
cd "$APP_DIR/deploy"
if [ ! -f .env ]; then
  cp ../server/.env.example .env
  sed -i "s|^API_DOMAIN=.*|API_DOMAIN=${API_DOMAIN}|" .env
  sed -i "s|^INTERNAL_API_KEY=.*|INTERNAL_API_KEY=$(openssl rand -hex 32)|" .env
  chown deploy:deploy .env && chmod 600 .env
fi

say "5/6 scorer keypair"
install -d -m 700 -o 1000 -g 1000 secrets
if [ ! -f secrets/scorer.json ]; then
  docker run --rm -v "$PWD/secrets:/out" -v "$APP_DIR/server/scripts:/s:ro" node:22-slim node /s/gen-keypair.mjs /out/scorer.json > secrets/scorer.pubkey
  chown 1000:1000 secrets/scorer.json && chmod 400 secrets/scorer.json
fi
SCORER=$(cat secrets/scorer.pubkey)

say "6/6 start"
sudo -u deploy docker compose up -d --build

cat <<EOF

────────────────────────────────────────────────────────────
 Status API is starting on https://${API_DOMAIN}

 Next steps
 1. DNS: point an A record for ${API_DOMAIN} at this droplet's IP
    (Caddy gets the HTTPS certificate automatically once DNS resolves).
 2. Edit $APP_DIR/deploy/.env  — CORS_ORIGINS, RPC_URL, HELIUS_API_KEY …
    then:  cd $APP_DIR/deploy && docker compose up -d
 3. Scorer address (must be the registry authority + needs a little SOL):
       ${SCORER}
 4. Copy INTERNAL_API_KEY from .env into Vercel as STATUS_API_KEY.
 5. GitHub Actions auto-deploy: add your CI public key to
       /home/deploy/.ssh/authorized_keys
 Health:  curl https://${API_DOMAIN}/health
────────────────────────────────────────────────────────────
EOF
