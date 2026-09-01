// ---------------------------------------------------------------------------
// BEACON Q backend — seed a debug account.
//
// Local debugging only. Upserts a single user (default: "admin" / "admin1234"
// with role TEACHER) so you don't have to register through the client app and
// then flip the role by hand in mongosh.
//
// It goes through UserModel rather than writing the collection directly, so the
// pre('save') hook hashes the password exactly the way a real registration
// would. Running it again is safe: an existing account has its password and
// role reset to the configured values.
//
// This file is compiled to dist/scripts/seedDebugUser.js by `npm run build`
// (tsconfig `include` is "**/*.ts"), so it is present inside the app image.
//
// Run against a running docker-compose stack:
//   docker compose exec app node dist/scripts/seedDebugUser.js
// or, without the app container running (mongo must be up):
//   docker compose run --rm --no-deps --entrypoint "" app node dist/scripts/seedDebugUser.js
//
// Override the defaults with env vars:
//   DEBUG_USER_NAME, DEBUG_USER_PASSWORD, DEBUG_USER_ROLE (STUDENT | TEACHER)
// ---------------------------------------------------------------------------

import process from 'process';
import mongoose from 'mongoose';
import { UserModel } from '../models/user';

const VALID_ROLES = ['STUDENT', 'TEACHER'] as const;
type Role = (typeof VALID_ROLES)[number];

function parseRole(value: string | undefined): Role {
  if (value === 'STUDENT' || value === 'TEACHER') return value;
  if (value) {
    console.warn(
      `DEBUG_USER_ROLE="${value}" is not one of ${VALID_ROLES.join(', ')}; using TEACHER.`
    );
  }
  return 'TEACHER';
}

async function seedDebugUser(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set; cannot seed the debug user.');
    process.exit(1);
  }

  const username = process.env.DEBUG_USER_NAME || 'admin';
  const password = process.env.DEBUG_USER_PASSWORD || 'admin1234';
  const role = parseRole(process.env.DEBUG_USER_ROLE);

  if (process.env.NODE_ENV === 'production') {
    // A loud guard rather than a hard stop: the compose stack sets
    // NODE_ENV=production even for local debugging, so blocking here would make
    // the script unusable. It is still worth flagging if this ever runs
    // somewhere it shouldn't.
    console.warn(
      'WARNING: NODE_ENV=production. seedDebugUser is a local debugging tool — ' +
        'do not run it against a real deployment.'
    );
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });

  try {
    let user = await UserModel.findOne({ username });
    if (user) {
      user.password = password; // pre('save') re-hashes it
      user.role = role;
      await user.save();
      console.log(`Updated debug user "${username}" (role=${role}).`);
    } else {
      user = new UserModel({ username, password, role }); // pre('save') hashes it
      await user.save();
      console.log(`Created debug user "${username}" (role=${role}).`);
    }

    console.log(`  login    : ${username} / ${password}`);
    console.log(`  _id      : ${String(user._id)}`);
    console.log(
      `  (set ADMIN_USER_ID=${String(user._id)} in .env to use this account for /secure/admin routes)`
    );
  } finally {
    await mongoose.connection.close();
  }
}

seedDebugUser().catch((err: unknown) => {
  console.error(`Failed to seed the debug user: ${err}`);
  process.exit(1);
});
