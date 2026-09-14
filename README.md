# BEACON Q - Backend (API server & database)

[![License](https://img.shields.io/github/license/apuyou/store-badge)](https://github.com/aryobarzan/beaconq-backend-node/blob/main/LICENSE)
[![CodeFactor](https://www.codefactor.io/repository/github/aryobarzan/beaconq-backend-node/badge/main)](https://www.codefactor.io/repository/github/aryobarzan/beaconq-backend-node/overview/main)

Backend for the quiz platform "BEACON Q" ([Play Store](https://play.google.com/store/apps/details?id=lu.uni.coast.beacon_q_app), [App Store](https://apps.apple.com/us/app/beacon-q/id1643852992)), based on Node.js and MongoDB.

As of 26 November 2025: ⭐ **fully migrated to TypeScript** ⭐

**Overview**:

- ✅ TypeScript
- ✅ Rotating logs
- ✅ MongoDB transactions (requires replica set)
- 🆗 Interactive API documentation (Swagger) - PARTIAL (in progress)
- ✅ Script for automatic schema generation (see `scripts/generateSchemas.js`)
- ✅ Docker
  - MongoDB replica set (3 nodes)
  - Automatic MongoDB initialization (keyfile, replica set initialization, user creation; see `docker-compose.yml` and `mongo-init.js.example`)
  - Automatic daily MongoDB backup (see `scripts/mongoDBDockerBackup.sh`)
  - Replica set healthcheck verifying initialization, advertised member hostnames and primary election (see `scripts/mongoHealthcheck.sh`)
  - Automatic restart for services
  - Multi-stage build (see `Dockerfile`)
  - Separate communication network for services

## Linting & formatting

`ESLint` and `Prettier` are used for automatic pre-commit linting and formatting of code using the `husky` and `lint-staged` packages. (see `package.json` and `.husky/pre-commit`)

## Docker

A `Dockerfile` and `docker-compose.yaml` are included to easily get both the Node.js and MongoDB replica set up and running:

- Wipe build and volumes: `docker-compose down --volumes`
- Run: `docker-compose up --build`

However, you are also free to directly run the node app on your local machine (`npm run dev`), alongside running a MongoDB server on your machine.

## Setup

This project relies on a number of environment variables and external credentials (Firebase service account JSON). For security reasons, never commit real credentials to the repository — use the provided `.env.example` as a template and keep your real `.env` and service account files outside source control.

**Note**: Node 18+ is required due to the mongoose package (>=9.0.0).

### Environment file (`.env`)

Use the provided `.env.example` to identify the expected key-values.

What to set (baseline):

- `PORT` — port the server listens on (default: `3000`).
- `NODE_ENV` — `development` or `production`.
- `MONGO_URI` — MongoDB connection string
- `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, `MONGO_INITDB_DATABASE` — used by Docker's mongo initialization.
- `GOOGLE_APPLICATION_CREDENTIALS` — path to your Firebase service account JSON file (see below).

### Firebase service account

1. [Set up](https://firebase.google.com/docs/admin/setup#set-up-project-and-service-account) your Firebase project.
2. Go to your project's page on [Firebase Console](https://console.firebase.google.com/).
3. Go to the project settings (cog icon top-left) and select the tab "Cloud Messaging".
4. Enable "Firebase Cloud Messaging API (V1)".
5. [Export](https://firebase.google.com/docs/admin/setup?authuser=0#initialize_the_sdk_in_non-google_environments) a service account key file.
6. Store the file somewhere in your project, then update the property "GOOGLE_APPLICATION_CREDENTIALS" in your `.env` file to point to it. (indicate the path to it)

Do NOT store this service account key file in your source control, e.g., do not commit it to your git repository.

- Recommended: include the file in your `.gitignore`.

### Mongo init & keyfile

The `docker-compose.yml` config expects two files on the host (root project folder) when running the local Mongo replica set:

- `mongo-init.js` — an initialization script mounted into the primary node (mongo1) at `/docker-entrypoint-initdb.d/mongo-init.js`.
- `mongo-keyfile` — a shared key used by MongoDB for inter-node authentication. (mongo1, mongo2, mongo3)

1. Generate the keyfile: `openssl rand -base64 756 > mongo-keyfile` ([official MongoDB docs](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-with-keyfile-access-control/#create-a-keyfile))
2. If you are on a UNIX system (Linux, macOS), you can manually set the required permissions/mode: `chmod 400 mongo-keyfile`
   - If you are on Windows, setting the permissions will not transfer to the UNIX context of Docker.
   - To that end, `docker-compose.yaml` includes an initialization service "keyfile-init" to automatically adjust the permissions and owner of the file.
3. Create a file `mongo-init.js` in the root of your project, then copy the provided template from `mongo-init.js.example` to this new file and adjust it to your needs.
   - `mongo-init.js` is only evaluated by the MongoDB image during the first initialization. Its purpose is to create a non-root database to store the project's data in, with separate authentication credentials and non-admin permissions for security reasons.
   - **NOTE**: this is NOT for creating the root (admin) mongo user. That step is done via our inclusion of the fields `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD` in `docker-compose.yaml`. Do not use the same username and password for both cases.

## Troubleshooting

### Windows: "ports are not available" / bind: access forbidden by its access permissions

On Windows, `docker-compose up` can suddenly fail with an error like this, even though nothing else is using the port:

```
Error response from daemon: ports are not available: exposing port TCP 0.0.0.0:3000 -> 127.0.0.1:0: listen tcp 0.0.0.0:3000: bind: An attempt was made to access a socket in a way forbidden by its access permissions.
```

This is **not** the usual "port already in use" error (which would say something different). It means Windows/Hyper-V (used by WSL2, which backs Docker Desktop) has reserved the port in a **dynamic TCP port exclusion range**, so the OS refuses to let anything bind to it — including Docker. This can happen spontaneously after a Windows update, a Docker Desktop update, a WSL restart, or a reboot, since Hyper-V's NAT service (`winnat`) periodically re-allocates these ranges and can happen to grab a block that includes a port you need (e.g. `3000`).

**Diagnose it:**

1. Check if the port is actually held by a process (the "normal" case):
   ```powershell
   netstat -ano | findstr ":3000"
   ```
   If nothing is listed, it's not a process holding the port — go to step 2.
2. Check Windows' TCP port exclusion ranges:
   ```powershell
   netsh interface ipv4 show excludedportrange protocol=tcp
   ```
   If the port you need (e.g. `3000`) falls inside one of the listed `Start Port`–`End Port` ranges, that confirms it's being blocked by a reserved exclusion, not by another application.

**Fix it:**

1. Stop your containers first: `docker-compose down`
2. Restart the Windows NAT service, from an **Administrator** PowerShell/terminal:
   ```powershell
   net stop winnat
   net start winnat
   ```
3. Re-run `netsh interface ipv4 show excludedportrange protocol=tcp` to confirm the port is no longer in an excluded range.
4. Bring the stack back up: `docker-compose up -d`

Note: `wsl --shutdown` alone is often not enough — the exclusion range is typically only released once `winnat` itself is restarted (or the machine is rebooted). If restarting `winnat` doesn't help, a full reboot will also clear it.

### ipv6 issue

Depending on your machine's configuration, the server can fail to connect to external domains, such as Google Firebase.  
To fix this, you need to disable ipv6: (example steps for Linux system)

- Append the following lines to `/etc/sysctl.conf`:

```
net.ipv6.conf.all.disable_ipv6=1
net.ipv6.conf.default.disable_ipv6=1
net.ipv6.conf.lo.disable_ipv6 = 1
```

- Save the file.
- Run: `sysctl -p`.
- Verify if your change was succesful: `cat /proc/sys/net/ipv6/conf/all/disable_ipv6`
  - Output should be "1"!

### MongoDB: Server selection timed out after 30000 ms

**Symptoms**

The stack starts and `mongo1` reports `healthy`, but the Node.js app and the backup service keep failing to connect to MongoDB:

```
{"level":50,"msg":"Mongo connect attempt #1 failed: MongooseServerSelectionError: Server selection timed out after 30000 ms"}
{"level":50,"msg":"Mongo connect attempt #2 failed: MongooseServerSelectionError: Server selection timed out after 30000 ms"}
```

**Cause**

A MongoDB replica set persists its member list (the "replica set config") **inside the database files** — here, in the named volume `mongo1-data`.

`rs.initiate()` only runs **once**, during the very first initialization of that volume. From then on, the volume keeps whatever hostnames were in effect at that moment, and `docker-compose down` (without `--volumes`) does not reset it.

If the set was ever initialized with a hostname other than the container names — for example `host.docker.internal`, which is what a local `docker-compose.override.yml` uses — the config stays pinned to that hostname:

```json
["host.docker.internal:27017", "host.docker.internal:27018", "host.docker.internal:27019"]
```

The app can still reach the seed `mongo1:27017`, but the driver is then told that the **primary** lives at `host.docker.internal:27017`. When the mongo ports are not published on the host (i.e. no `docker-compose.override.yml` is present), nothing is listening there, so the driver never completes server selection and times out after 30 seconds.

This most often appears when moving the project between machines (e.g. Windows → macOS): `docker-compose.override.yml` is **gitignored**, so the working local setup does not travel with the repository, while the initialized volume still advertises the old hostnames.

> The `mongo1` healthcheck (`scripts/mongoHealthcheck.sh`) detects this condition. It initialises the replica set on the first run, and then fails as long as the advertised hostnames do not match the container names, or no primary has been elected. `mongo1` is therefore reported as `unhealthy`, and because the app and the backup service use `depends_on: service_healthy`, they no longer start against an unusable database.
>
> The container remains `unhealthy` until an election completes. On a first initialisation this delays `docker-compose up` by roughly 30–60 seconds — that is expected, not a hang, and it does **not** require running `docker-compose up` a second time. Docker keeps re-running the probe (every `interval`, up to `retries` times) until it succeeds, and only starts the app and the backup service once it does.
>
> The healthcheck only *detects* a stale config, it cannot repair one: a set advertised under the wrong hostnames stays `unhealthy` and `docker-compose up` fails once the retries are exhausted. Apply the `rs.reconfig` fix below in that case.

**Diagnose**

The quickest signal is the health output of the container:

```bash
docker inspect --format '{{range .State.Health.Log}}exit={{.ExitCode}} out={{.Output}}{{end}}' "$(docker-compose ps -q mongo1)"
```

A replica set advertising the wrong hostnames reports lines such as:

```
exit=1 out=unhealthy: replica set advertises [host.docker.internal:27017, ...] but expected [mongo1:27017, ...]
```

To confirm the advertised hostnames directly, with the stack running:

```bash
docker-compose exec -T mongo1 mongosh --quiet \
  -u <username> -p <password> --authenticationDatabase admin \
  --eval 'db.adminCommand({replSetGetConfig:1}).config.members.map(m => m.host)'
```

Replace `<username>` / `<password>` with the values of `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` from your `.env`.

Expected output:

```
[ 'mongo1:27017', 'mongo2:27018', 'mongo3:27019' ]
```

Anything else (for instance `host.docker.internal:...`) means the volume holds a stale config.

**Fix (keeps your data)**

Re-point the replica set at the container names in place, then restart the services:

```bash
docker-compose stop app mongo-backup

docker-compose exec -T mongo1 mongosh --quiet \
  -u <username> -p <password> --authenticationDatabase admin \
  --eval 'const cfg = db.adminCommand({replSetGetConfig:1}).config;
          cfg.version++;
          cfg.members[0].host = "mongo1:27017";
          cfg.members[1].host = "mongo2:27018";
          cfg.members[2].host = "mongo3:27019";
          printjson(db.adminCommand({replSetReconfig: cfg, force: true}));'

docker-compose up -d
```

Then confirm that all three members are healthy and that exactly one has been elected primary (the election can take a few seconds):

```bash
docker-compose exec -T mongo1 mongosh --quiet \
  -u <username> -p <password> --authenticationDatabase admin \
  --eval 'const s = db.adminCommand({replSetGetStatus:1});
          print(JSON.stringify(s.members.map(m => ({name: m.name, state: m.stateStr, health: m.health})), null, 2))'
```

**Alternative fix (erases the database)**

If you do not need to keep the data, delete the volumes so the replica set is initialized from scratch with the correct container names:

```bash
docker-compose down --volumes
docker-compose up -d
```

**How to avoid it**

- Keep the replica set advertised as `mongo1` / `mongo2` / `mongo3`. The app reaches MongoDB through Docker's internal DNS; nothing else is needed for normal operation.
- Never initialize a replica set with `host.docker.internal`. A local `docker-compose.override.yml` exists to let **host tools** reach the ports of a set that is already advertised under container names — it is not a substitute for publishing ports.
- If you need to connect from the host, prefer the hosts-file approach (Approach #2 below) over re-advertising the members.
- Remember that `docker-compose down` (without `--volumes`) preserves `mongo1-data`, and therefore preserves a stale config. `docker-compose down --volumes` is the only command that resets it.
- When moving a database between machines, prefer restoring a dump with `mongorestore` (the format produced by `scripts/mongoDBDockerBackup.sh`) instead of copying raw database volumes, so the destination uses its own replica set config.

---

### Connecting to mongo containers from host machine

Internally (docker), the node service can connect to the MongoDB replica set using their assigned container names (mongo1, mongo2, mongo3).  
This is facilitated by Docker's own DNS service, which maps each container name to its corresponding IP address in the Docker network.

Subsequently, the host machine does not know anything about these container names, as it cannot resolve the associated IP addresses for them.

#### Approach #1: docker-compose (local override file)

The committed `docker-compose.yml` deliberately does **not** publish the MongoDB ports, and the replica set advertises its members under the internal container names (`mongo1:27017`, `mongo2:27018`, `mongo3:27019`). That is all the app and the backup service need, since they run on the same Docker network.

For local development you can add a **local, gitignored** `docker-compose.override.yml` that re-publishes the mongo ports (27017–27019) and re-advertises the members as `host.docker.internal`, so tools on the host can reach the replica set. Docker Compose merges it automatically on top of `docker-compose.yml`.

As `.gitignore` states, this file is local-only: *"The server runs docker-compose.yml alone - this file must never be copied there."*

> ⚠️ **Warning**: this override changes the hostnames the replica set is initialized with. If a volume is initialized while the override is active, `mongo1-data` will permanently advertise `host.docker.internal`, which breaks the app as soon as the override is absent. See [MongoDB: Server selection timed out after 30000 ms](#mongodb-server-selection-timed-out-after-30000-ms). Only use the override against a set that was already initialized under the container names.

**To connect from your host machine** (using `mongosh` or MongoDB Compass):

First, you need to add `host.docker.internal` to your hosts file so your machine can resolve it:

- **macOS/Linux**: Add to `/etc/hosts` (requires sudo):
  ```bash
  echo "127.0.0.1 host.docker.internal" | sudo tee -a /etc/hosts
  ```
- **Windows**: Add to `C:\Windows\System32\drivers\etc\hosts` (requires admin):
  ```
  127.0.0.1 host.docker.internal
  ```

Then use this connection string:

```
mongodb://<user>:<password>@host.docker.internal:27017,host.docker.internal:27018,host.docker.internal:27019/?replicaSet=rs0&authSource=admin
```

**Note**: Even if you use `localhost` in the connection string, MongoDB's replica set will redirect you to the `host.docker.internal` hostnames internally, so the hosts file entry is required.

- Replace `<user>` and `<password>` with the admin credentials we have set up in our `.env` file. (`MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`)

#### Approach #2: manually adjust hosts

The manual approach would be to add the IP mappings to our host's DNS resolution setup:

- Windows: edit the file `C:\Windows\System32\drivers\etc\hosts`
  - open the file as admin, e.g., open Notepad as administrator
- Linux/macOS: edit the file `/etc/hosts`
  - use `sudo`
- In the given `hosts` file, add a line for each container name, where we map them to the IP address on the host machine that can access our MongoDB server running in the Docker network. For example, in the case of "localhost", add the following entries:

```
127.0.0.1 mongo1
127.0.0.1 mongo2
127.0.0.1 mongo3
```

- Finally, to connect to our replica set, use the following connection string (using `mongosh` or MongoDB Compass): `mongodb://<user>:<password>@mongo1:27017,mongo2:27018,mongo3:27019/?replicaSet=rs0&authSource=admin`
  - replace "user" and "password" with the admin credentials we have set up in our `.env` file. (`MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`)
- Note: this approach still requires the mongo ports to be published on the host. The committed `docker-compose.yml` does **not** publish them, so you also need the local `docker-compose.override.yml` described in Approach #1 (the hosts file only makes the *names* resolvable, it does not open the ports).

The solution is to manually override your host machine's DNS resolution by editing its local hosts file. This file acts as a local, static DNS record keeper.
You are telling your host machine: "When anything tries to look up the name mongo1, use this specific IP address."

## Publications

> - [BEACON Q: Encouraging Regular Self-Testing via a Personalized and Gamified Quiz App](https://orbilu.uni.lu/handle/10993/65895)
> - [High-Fidelity Simulation Pre-Briefing with Digital Quizzes: Using INACSL Standards for Improving Effectiveness](https://orbilu.uni.lu/handle/10993/61375)
> - [Difficulty-Adjusted Quizzes: An Effectiveness Analysis](https://ieeexplore.ieee.org/abstract/document/10398305)
> - [Improving Long-Term Retention through Personalized Recall Testing and Immediate Feedback](https://ieeexplore.ieee.org/abstract/document/10111487)
