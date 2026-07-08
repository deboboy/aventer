#!/usr/bin/env bash
# Run on the Hetzner VPS as root to install Postgres 16 via Docker.
set -euo pipefail

DB_USER="${AVENTER_DB_USER:-aventer}"
DB_NAME="${AVENTER_DB_NAME:-aventer}"
DB_PASSWORD="${AVENTER_DB_PASSWORD:-}"

if [[ -z "$DB_PASSWORD" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  echo "Generated Postgres password (save this): $DB_PASSWORD"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if docker ps -a --format '{{.Names}}' | grep -qx aventer-db; then
  echo "Container aventer-db already exists — skipping create"
else
  docker run -d \
    --name aventer-db \
    -e POSTGRES_USER="$DB_USER" \
    -e POSTGRES_PASSWORD="$DB_PASSWORD" \
    -e POSTGRES_DB="$DB_NAME" \
    -v aventer-pg:/var/lib/postgresql/data \
    --restart unless-stopped \
    -p 127.0.0.1:5432:5432 \
    postgres:16
fi

echo ""
echo "Postgres is listening on 127.0.0.1:5432"
echo ""
echo "Add to /etc/aventer/env:"
echo "DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
echo ""
echo "Then:"
echo "  cd /opt/aventer && sudo -u aventer git pull origin main"
echo "  sudo -u aventer bash -lc 'cd /opt/aventer && npm ci && npm run build:api'"
echo "  sudo systemctl restart aventer-api"
echo "  curl -s https://api.aventer.dev/health"
