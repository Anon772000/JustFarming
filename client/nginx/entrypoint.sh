#!/usr/bin/env sh
set -eu

CERT_DIR="/etc/nginx/certs"
CRT="$CERT_DIR/tls.crt"
KEY="$CERT_DIR/tls.key"
TLS_SELF_SIGNED_FALLBACK="${TLS_SELF_SIGNED_FALLBACK:-true}"

mkdir -p "$CERT_DIR"

if [ ! -s "$CRT" ] || [ ! -s "$KEY" ]; then
  if [ "$TLS_SELF_SIGNED_FALLBACK" != "true" ]; then
    echo "Missing TLS cert/key at $CRT and $KEY, and TLS_SELF_SIGNED_FALLBACK=false."
    echo "Mount real certs (e.g. via docker-compose.prod.yml) before starting."
    exit 1
  fi

  echo "Generating self-signed TLS cert for nginx..."

  # Default to the public domain so Cloudflare (or direct access) sees a matching hostname.
  # Note: This is still self-signed unless you mount real certs into /etc/nginx/certs.
  TLS_DOMAIN="${TLS_DOMAIN:-croxtoneast.au}"

  # Keep legacy names and IPs so direct IP access can still work when needed.
  TLS_SANS="${TLS_SANS:-DNS:${TLS_DOMAIN},DNS:*.${TLS_DOMAIN},DNS:croxton-east,IP:127.0.0.1,IP:209.38.22.136}"

  openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -keyout "$KEY" \
    -out "$CRT" \
    -subj "/CN=${TLS_DOMAIN}" \
    -addext "subjectAltName=${TLS_SANS}" \
    >/dev/null 2>&1
fi

exec nginx -g "daemon off;"
