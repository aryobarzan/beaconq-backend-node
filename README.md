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

---

### Connecting to mongo containers from host machine

Internally (docker), the node service can connect to the MongoDB replica set using their assigned container names (mongo1, mongo2, mongo3).  
This is facilitated by Docker's own DNS service, which maps each container name to its corresponding IP address in the Docker network.

Subsequently, the host machine does not know anything about these container names, as it cannot resolve the associated IP addresses for them.

#### Approach #1: docker-compose

Currently, the `docker-compose.yml` file has been set up in a way to enable mongo connections from the host machine using the host name "host.docker.internal":

- For each mongo container (mongo1, mongo2, mongo3), we introduce the following key-value mapping under 'environment': `MONGODB_ADVERTISED_HOSTNAME: host.docker.internal`
- For the primary node (mongo1), we update its `healthcheck` command to use this new hostname, as it crucially sets up our replica set! (previously, we were simply using the container names)

With this setup, we can connect to our MongoDB replica set with the following connection string (using `mongosh` or MongoDB Compass): `mongodb://<user>:<password>@host.docker.internal:27017,host.docker.internal:27018,host.docker.internal:27019/?replicaSet=rs0&authSource=admin`

- replace "user" and "password" with the admin credentials we have set up in our `.env` file. (`MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`)

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

The solution is to manually override your host machine's DNS resolution by editing its local hosts file. This file acts as a local, static DNS record keeper.
You are telling your host machine: "When anything tries to look up the name mongo1, use this specific IP address."

## Publications

> - [BEACON Q: Encouraging Regular Self-Testing via a Personalized and Gamified Quiz App](https://orbilu.uni.lu/handle/10993/65895)
> - [High-Fidelity Simulation Pre-Briefing with Digital Quizzes: Using INACSL Standards for Improving Effectiveness](https://orbilu.uni.lu/handle/10993/61375)
> - [Difficulty-Adjusted Quizzes: An Effectiveness Analysis](https://ieeexplore.ieee.org/abstract/document/10398305)
> - [Improving Long-Term Retention through Personalized Recall Testing and Immediate Feedback](https://ieeexplore.ieee.org/abstract/document/10111487)
