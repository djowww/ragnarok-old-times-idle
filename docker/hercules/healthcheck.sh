#!/usr/bin/env bash
set -Eeuo pipefail

# A reachable DB alone is insufficient: Idle must wait for both classic imports.
# Credentials stay in the process environment; failed probes emit no SQL/secrets.
export MYSQL_PWD="${DB_PASSWORD:?}"
mariadb --protocol=TCP --connect-timeout=3 \
  --host="${DB_HOST:-database}" --port="${DB_PORT:-3306}" \
  --user="${DB_USER:?}" "${DB_NAME:?}" \
  --execute='SELECT 1 FROM login LIMIT 0; SELECT 1 FROM loginlog LIMIT 0' \
  >/dev/null 2>&1
