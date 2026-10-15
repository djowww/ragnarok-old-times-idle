#!/usr/bin/env bash
set -Eeuo pipefail

cd /opt/hercules

libconfig_escape() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  printf '%s' "$value"
}

export DB_HOST_LIBCONFIG="$(libconfig_escape "${DB_HOST:-database}")"
export DB_USER_LIBCONFIG="$(libconfig_escape "${DB_USER:?DB_USER is required}")"
export DB_PASSWORD_LIBCONFIG="$(libconfig_escape "${DB_PASSWORD:?DB_PASSWORD is required}")"
export DB_NAME_LIBCONFIG="$(libconfig_escape "${DB_NAME:?DB_NAME is required}")"

render_config() {
  local template="$1"
  local destination="$2"
  mkdir -p "$(dirname "$destination")"
  envsubst < "$template" > "$destination"
}

render_config /opt/hercules/docker-config/sql_connection.conf.template \
  /opt/hercules/conf/global/sql_connection.conf
render_config /opt/hercules/docker-config/import/login-server.conf.template \
  /opt/hercules/conf/import/login-server.conf
render_config /opt/hercules/docker-config/import/char-server.conf.template \
  /opt/hercules/conf/import/char-server.conf
render_config /opt/hercules/docker-config/import/map-server.conf.template \
  /opt/hercules/conf/import/map-server.conf
render_config /opt/hercules/docker-config/import/inter-server.conf.template \
  /opt/hercules/conf/import/inter-server.conf
render_config /opt/hercules/docker-config/import/battle.conf.template \
  /opt/hercules/conf/import/battle.conf

db_args=(
  --protocol=TCP
  --host="${DB_HOST:-database}"
  --port="${DB_PORT:-3306}"
  --user="${DB_USER:?DB_USER is required}"
)
export MYSQL_PWD="${DB_PASSWORD:?DB_PASSWORD is required}"

connected=false
for attempt in {1..60}; do
  if mariadb "${db_args[@]}" "${DB_NAME:?DB_NAME is required}" --execute='SELECT 1' >/dev/null 2>&1; then
    connected=true
    break
  fi
  sleep 2
done

if [[ "$connected" != true ]]; then
  echo "Hercules could not connect to MariaDB at ${DB_HOST:-database}:${DB_PORT:-3306}." >&2
  exit 1
fi

db_query() {
  mariadb "${db_args[@]}" --batch --skip-column-names "${DB_NAME:?DB_NAME is required}" --execute="$1"
}

tables="$(db_query 'SHOW TABLES')"
login_table="$(db_query "SHOW TABLES LIKE 'login'")"
loginlog_table="$(db_query "SHOW TABLES LIKE 'loginlog'")"
idle_only=true
while IFS= read -r table; do
  [[ -z "$table" ]] && continue
  if [[ "$table" != "idle_profiles" && "$table" != "idle_commands" && "$table" != "idle_chat_messages" ]]; then
    idle_only=false
  fi
done <<< "$tables"

if [[ -n "$login_table" && -n "$loginlog_table" ]]; then
  echo "Hercules SQL schemas already exist; leaving the database unchanged."
elif [[ -z "$tables" || "$idle_only" == true ]]; then
  echo "Initializing Hercules SQL schemas in database '${DB_NAME}'."
  mariadb "${db_args[@]}" "${DB_NAME}" < /opt/hercules/sql-files/main.sql
  mariadb "${db_args[@]}" "${DB_NAME}" < /opt/hercules/sql-files/logs.sql
else
  echo "The database contains a partial Hercules schema (login/loginlog missing)." >&2
  echo "No tables were changed. Inspect the database before restarting Hercules." >&2
  exit 1
fi

pids=()
stop_servers() {
  trap - TERM INT
  if ((${#pids[@]})); then
    kill "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
}
trap stop_servers TERM INT

/opt/hercules/login-server &
pids+=("$!")
/opt/hercules/char-server &
pids+=("$!")
/opt/hercules/map-server &
pids+=("$!")

set +e
wait -n "${pids[@]}"
server_status=$?
set -e
stop_servers
exit "$server_status"
