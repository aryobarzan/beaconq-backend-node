#!/bin/sh
# Healthcheck for the mongo1 node of the "rs0" replica set.
#
# The container is reported healthy only when the replica set is actually
# usable, which requires all of the following:
#
#   1. the set is initialised (this script initialises it on the first run),
#   2. its members are advertised under the expected hostnames,
#   3. exactly one primary has been elected.
#
# The expected member list comes from MONGO_RS_HOST (comma-separated), so this
# one script serves both topologies: the production default of a single node
# addressed by container name, and the local override that advertises
# host.docker.internal so host tools can reach the same set. Previously the
# override duplicated this logic inline and drifted out of sync with it.
#
# This replaces an inline `mongosh --eval` healthcheck that wrapped
# `rs.status()` / `rs.initiate()` in a JS try/catch. Because that error was
# swallowed, mongosh always exited 0 and the container reported "healthy" even
# when the replica set was unusable - for instance when a pre-existing volume
# advertised `host.docker.internal` instead of the container names. It also
# defeated `depends_on: service_healthy`, so the app started against a broken
# database and died with "Server selection timed out after 30000 ms".
#
# Every failure path below exits non-zero on purpose, so that Docker marks the
# container unhealthy instead of hiding the problem.
#
# Note on the first run: the set is initialised and the probe exits 1, because
# an election still has to complete. The container therefore only becomes
# healthy once a primary exists, which is what dependents should wait for.

# set -e: exit on error
# set -u: throw error (and abort script) on unset variables
set -eu

# Production default: a single member, addressed by container name. The local
# override sets this to host.docker.internal:27017.
: "${MONGO_RS_HOST:=mongo1:27017}"

# Only the first line interpolates; the heredoc delimiter is quoted, so nothing
# inside the JS is touched by the shell.
JS="const expected = '${MONGO_RS_HOST}'.split(',');
$(cat <<'EOJS'

// 1. Initialise the replica set on the very first run. It cannot be healthy
//    yet: an election has to take place first.
let status;
try {
  status = rs.status();
} catch (err) {
  rs.initiate({
    _id: "rs0",
    members: expected.map((host, index) => ({ _id: index, host: host })),
  });
  print("unhealthy: replica set initialised, waiting for election");
  quit(1);
}

// 2. The advertised hostnames must be the expected ones. A set that was
//    initialised with any other hostname keeps that config permanently, which
//    leaves the app unable to reach the primary. This is also what catches a
//    stale volume from an earlier, differently-shaped replica set.
const advertised = db
  .adminCommand({ replSetGetConfig: 1 })
  .config.members.map((member) => member.host);
const advertisementsMatch =
  advertised.length === expected.length &&
  advertised.every((host) => expected.includes(host));
if (!advertisementsMatch) {
  print(
    "unhealthy: replica set advertises [" + advertised.join(", ") +
      "] but expected [" + expected.join(", ") + "]. " +
      "A volume initialised with a different topology must be recreated."
  );
  quit(1);
}

// 3. Without a primary the set cannot accept writes.
const primary = status.members.filter((member) => member.stateStr === "PRIMARY");
if (primary.length !== 1) {
  print("unhealthy: expected exactly 1 primary, found " + primary.length);
  quit(1);
}

print("healthy: primary " + primary[0].name);
quit(0);
EOJS
)"

# Invoked as `sh /healthcheck.sh`, so no executable bit is required and the
# script does not depend on a shebang inside the container.
exec mongosh --quiet \
  --host mongo1 --port 27017 \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --eval "$JS"
