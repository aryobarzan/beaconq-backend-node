#!/bin/bash
# ---------------------------------------------------------------------------
# BEACON Q backend — seed the debug account into the docker-compose stack.
#
# Thin wrapper around dist/scripts/seedDebugUser.js. Prefers `exec` (fast, uses
# the already-running app container); falls back to a one-off container if the
# app service is not up. Mongo must be running either way.
#
# Usage:
#   scripts/seed-debug-user.sh
#   DEBUG_USER_NAME=teacher DEBUG_USER_PASSWORD=teach1234 scripts/seed-debug-user.sh
# ---------------------------------------------------------------------------
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

SCRIPT=dist/scripts/seedDebugUser.js
ENV_ARGS=()
for v in DEBUG_USER_NAME DEBUG_USER_PASSWORD DEBUG_USER_ROLE; do
  [ -n "${!v:-}" ] && ENV_ARGS+=(--env "$v=${!v}")
done

if docker compose ps --status running app 2>/dev/null | grep -q app; then
  exec docker compose exec "${ENV_ARGS[@]}" app node "$SCRIPT"
fi

echo "app container not running — starting a one-off container (mongo must be up)."
exec docker compose run --rm --no-deps --entrypoint "" "${ENV_ARGS[@]}" app node "$SCRIPT"
