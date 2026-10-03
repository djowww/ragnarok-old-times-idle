#!/bin/sh
set -eu

: "${PACKETVER:?PACKETVER is required}"

envsubst '${PACKETVER}' \
  < /opt/web-client/Config.local.js.template \
  > /usr/share/nginx/html/applications/pwa/Config.local.js

exec nginx -g 'daemon off;'
