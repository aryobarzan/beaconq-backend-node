#!/bin/bash
# ---------------------------------------------------------------------------
# BEACON Q backend — poll GitHub and redeploy when the production branch moves.
#
# Run from cron on the VM. Polls; nothing connects inbound, no credentials are
# stored, and the repository is public so no deploy key is needed.
#
# Safety properties, in the order they matter:
#   - Touches ONLY the `app` service. mongo1/2/3 and mongo-backup are never
#     stopped, rebuilt or restarted, so a deploy can never trigger a replica set
#     election or risk the data.
#   - Builds before switching. A build failure leaves the running version alone.
#   - Health-gates the new container and rolls back automatically if it does not
#     answer /health. This matters because the person pushing code has no VM
#     access and cannot fix a bad deploy by hand.
#   - Exits immediately when the remote has not moved, so it is cheap to run often.
#   - Holds a lock, so a slow build cannot overlap with the next cron tick.
#
# Install:
#   sudo install -m 755 autodeploy.sh /usr/local/bin/beaconq-autodeploy
#   crontab -e   ->   */10 * * * * /usr/local/bin/beaconq-autodeploy
#
# The cron user must be in the `docker` group and must own REPO_DIR.
# ---------------------------------------------------------------------------

set -uo pipefail

# cron runs with a minimal PATH that usually lacks docker, so set a known-good
# one rather than inheriting whatever cron provides.
PATH="${BEACONQ_PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}"
export PATH

REPO_DIR="${BEACONQ_REPO_DIR:-/var/www/elpis.uni.lu/beaconq-backend-node}"
BRANCH="${BEACONQ_BRANCH:-production}"
HEALTH_URL="http://localhost:3000/health"
HEALTH_ATTEMPTS=30          # x 2s = up to 60s for the new container to answer
# /var/log needs root to create a new file; fall back to the cron user's home so
# a non-root install still logs somewhere rather than failing on the first tick.
if [ -n "${BEACONQ_LOG:-}" ]; then
  LOG="$BEACONQ_LOG"
elif [ -w /var/log ] || [ -w /var/log/beaconq-autodeploy.log ]; then
  LOG=/var/log/beaconq-autodeploy.log
else
  LOG="$HOME/beaconq-autodeploy.log"
fi
LOCK="${BEACONQ_LOCK:-/tmp/beaconq-autodeploy.lock}"
MAX_LOG_BYTES=$((5 * 1024 * 1024))

log() { printf '%s  %s\n' "$(date -Is)" "$*" >>"$LOG"; }

# --- single instance ------------------------------------------------------
exec 9>"$LOCK" || exit 1
flock -n 9 || exit 0        # a previous run is still building; skip this tick

touch "$LOG" 2>/dev/null || { echo "cannot write $LOG" >&2; exit 1; }
if [ "$(stat -c%s "$LOG")" -gt "$MAX_LOG_BYTES" ]; then
  tail -c $((MAX_LOG_BYTES / 2)) "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  log "log truncated"
fi

cd "$REPO_DIR" || { log "ERROR repo not found: $REPO_DIR"; exit 1; }

# --- has anything changed? ------------------------------------------------
if ! git fetch --quiet origin "$BRANCH" 2>>"$LOG"; then
  log "ERROR git fetch failed"
  exit 1
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")
[ "$LOCAL" = "$REMOTE" ] && exit 0

log "=== update ${LOCAL:0:8} -> ${REMOTE:0:8} on $BRANCH ==="
git log --oneline "$LOCAL..$REMOTE" >>"$LOG" 2>&1

# --- keep the current image so a failed deploy can be undone --------------
if docker image inspect beaconq-app:current >/dev/null 2>&1; then
  docker tag beaconq-app:current beaconq-app:previous
  HAVE_ROLLBACK=1
else
  HAVE_ROLLBACK=0
  log "note: no existing image to roll back to (first deploy)"
fi

# Deterministic checkout. .env, mongo-init.js, mongo-keyfile and beaconQ_config
# are all gitignored, so none of them are touched by this.
if ! git reset --hard "$REMOTE" >>"$LOG" 2>&1; then
  log "ERROR git reset failed — aborting, running version untouched"
  exit 1
fi

# --- build ----------------------------------------------------------------
if ! docker compose build app >>"$LOG" 2>&1; then
  log "BUILD FAILED — reverting checkout, running version left untouched"
  git reset --hard "$LOCAL" >>"$LOG" 2>&1
  exit 1
fi

# --- switch ---------------------------------------------------------------
# --no-deps: never touch the mongo services.
if ! docker compose up -d --no-deps app >>"$LOG" 2>&1; then
  log "ERROR compose up failed"
fi

# --- health gate ----------------------------------------------------------
healthy=0
for _ in $(seq 1 "$HEALTH_ATTEMPTS"); do
  sleep 2
  if curl -fsS -m 5 "$HEALTH_URL" >/dev/null 2>&1; then healthy=1; break; fi
done

if [ "$healthy" -eq 1 ]; then
  log "DEPLOYED OK  $(git rev-parse --short HEAD)  $(git log -1 --pretty=%s)"
  docker image prune -f >/dev/null 2>&1
  exit 0
fi

# --- rollback -------------------------------------------------------------
log "HEALTH CHECK FAILED after $((HEALTH_ATTEMPTS * 2))s — rolling back"
# The app logs via pino to a ROTATING FILE, not to stdout, so `docker compose
# logs` shows only startup/crash output from node itself. The useful diagnostics
# are in ./log, which is bind-mounted from the container.
docker compose logs --tail 40 app >>"$LOG" 2>&1
for f in "$REPO_DIR/log/output.log" "$REPO_DIR/log/http_requests.log"; do
  [ -f "$f" ] && { log "--- tail of $(basename "$f") ---"; tail -n 30 "$f" >>"$LOG" 2>&1; }
done

git reset --hard "$LOCAL" >>"$LOG" 2>&1

if [ "$HAVE_ROLLBACK" -eq 1 ]; then
  docker tag beaconq-app:previous beaconq-app:current
  docker compose up -d --no-deps app >>"$LOG" 2>&1
  sleep 5
  if curl -fsS -m 5 "$HEALTH_URL" >/dev/null 2>&1; then
    log "ROLLED BACK to ${LOCAL:0:8} — service healthy"
  else
    log "CRITICAL rollback did not restore health; manual intervention needed"
  fi
else
  log "CRITICAL no previous image to roll back to; manual intervention needed"
fi
exit 1
