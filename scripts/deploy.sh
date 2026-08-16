#!/usr/bin/env bash
# Deploy helper for 404.directory
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building image"
docker build -t 404-directory:latest .

if command -v fly >/dev/null 2>&1; then
  echo "==> fly deploy"
  fly deploy
  echo "After deploy, point Spaceship DNS for 404.directory to the Fly app"
  echo "and run: fly certs add 404.directory"
  exit 0
fi

echo "Docker image built: 404-directory:latest"
echo
echo "404.directory currently resolves to Spaceship parking page IPs."
echo "To finish production cutover:"
echo "  1. Provision a host (Fly / VPS / Cloud Run) with this image"
echo "  2. At Spaceship DNS, replace parking A records with your host"
echo "  3. Terminate TLS (Caddy/nginx/Fly certs) for https://404.directory"
echo "  4. Set PUBLIC_BASE_URL=https://404.directory"
echo
echo "Local public smoke test (temporary):"
echo "  cloudflared tunnel --url http://127.0.0.1:4040"
