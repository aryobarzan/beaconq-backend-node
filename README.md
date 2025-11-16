# BEACON Q - Backend (API server & database)

[![License](https://img.shields.io/github/license/apuyou/store-badge)](https://github.com/aryobarzan/beaconq-backend-node/blob/main/LICENSE)
[![CodeFactor](https://www.codefactor.io/repository/github/aryobarzan/beaconq-backend-node/badge/main)](https://www.codefactor.io/repository/github/aryobarzan/beaconq-backend-node/overview/main)

Backend for the quiz platform "BEACON Q" ([Play Store](https://play.google.com/store/apps/details?id=lu.uni.coast.beacon_q_app), [App Store](https://apps.apple.com/us/app/beacon-q/id1643852992)), based on Node.js and MongoDB.

## Docker

A `Dockerfile` and `docker-compose.yaml` are included to easily get both the Node.js and MongoDB replica set up and running:

- Wipe build and volumes: `docker-compose down --volumes`
- Run: `docker-compose up --build`

However, you are also free to directly run the node app on your local machine (`npm run dev`), alongside running a MongoDB server on your machine.

## Setup

This project relies on a number of environment variables and external credentials (Firebase service account JSON). For security reasons, never commit real credentials to the repository — use the provided `.env.example` as a template and keep your real `.env` and service account files outside source control.

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

## Publications

> - [BEACON Q: Encouraging Regular Self-Testing via a Personalized and Gamified Quiz App](https://orbilu.uni.lu/handle/10993/65895)
> - [High-Fidelity Simulation Pre-Briefing with Digital Quizzes: Using INACSL Standards for Improving Effectiveness](https://orbilu.uni.lu/handle/10993/61375)
> - [Difficulty-Adjusted Quizzes: An Effectiveness Analysis](https://ieeexplore.ieee.org/abstract/document/10398305)
> - [Improving Long-Term Retention through Personalized Recall Testing and Immediate Feedback](https://ieeexplore.ieee.org/abstract/document/10111487)
