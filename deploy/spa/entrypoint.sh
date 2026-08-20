#!/bin/sh
set -eu

: "${PORT:=8080}"
: "${KUNK_API_PUBLIC_HOST:=kunk-api-production.up.railway.app}"

export PORT KUNK_API_PUBLIC_HOST

envsubst '${PORT} ${KUNK_API_PUBLIC_HOST}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
