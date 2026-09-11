#!/bin/sh
set -eu

: "${PORT:=8080}"

if [ -z "${KUNK_API_PUBLIC_HOST:-}" ]; then
  echo "KUNK_API_PUBLIC_HOST is required (hostname only, e.g. kunk-api.example.com)" >&2
  exit 1
fi

export PORT KUNK_API_PUBLIC_HOST

envsubst '${PORT} ${KUNK_API_PUBLIC_HOST}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
