# BeaconQ Backend - AI Agent Instructions

## Project Overview

TypeScript-based REST API server for BeaconQ quiz platform. Uses Express.js with MongoDB (replica set) and Firebase Admin SDK for push notifications. Serves mobile apps (iOS & Android).

## Architecture

### Core Components

- **Entry point**: `server.ts` - initializes Express, MongoDB, Firebase, logging, graceful shutdown
- **Routes**: `routes/routes.ts` (public), `routes/secureRoutes.ts` (JWT-protected)
- **Methods**: Business logic in `methods/` directory structure:
  - Top-level: `userActions.ts`, `teacherActions.ts`, `adminActions.ts`, `playActions.ts`, etc.
  - `methods/data/`: CRUD operations for core entities (activities, quizzes, courses, topics)
  - `methods/userLog/`: User interaction logging
- **Models**: `models/` - Mongoose schemas with TypeScript interfaces
- **Middleware**: Authentication, validation, logging, Firebase helpers, permissions

### Authentication Flow

- JWT tokens signed with RS256 (private key), verified with public key
- `middleware/auth.ts` extracts Bearer token, verifies it, attaches `req.token` (DecodedToken) and `req.username`
- Public routes in `routes.ts`, protected routes in `secureRoutes.ts` use auth middleware
- Token generation: `jwt.sign(user.toJSON(), process.env.PRIVATE_KEY, {algorithm: 'RS256', expiresIn: '5y'})`

### Database Patterns

#### MongoDB Transactions

**Critical**: Use `session.withTransaction()` for multi-document operations requiring atomicity:

```typescript
const session = await mongoose.startSession();
await session.withTransaction(async () => {
  await SomeModel.create([doc], { session });
  await OtherModel.updateOne({...}, {...}, { session });
});
```

Examples: `methods/data/activityActions.ts`, `methods/data/courseActions.ts`

#### Lean Queries

Use `.lean()` for read-only operations when Mongoose document methods aren't needed - improves performance:

```typescript
const user = await UserModel.findOne({ username }).lean();
```

#### JSON Serialization for Client

**Important**: Use `JSON.parse(JSON.stringify(mongooseDoc))` when sending responses to Flutter client (Dio framework requirement). Helps proper type decoding on client side. See `DOCS.md` and `methods/syncActions.ts`.

### Custom Type Extensions

Global Express types extended in `types/express.d.ts`:

- `Express.DecodedToken` - JWT payload shape
- `Express.Request` - adds `token?` and `username?` properties
- `Express.AuthenticatedRequest` - guaranteed `token` and `username` (for routes with auth middleware)

### Logging System

- **Application logs**: `middleware/logger.ts` uses Pino with rotating file streams (10MB rotation, 7-day interval)
- **Request logs**: `middleware/requestLogger.ts` - separate rotating logs for HTTP requests
- Both gracefully flush on shutdown in `server.ts`
- Dev mode: logs to both file and console (pretty-printed); production: file only

### Firebase Integration

- `middleware/firebaseHelper.ts` schedules push notifications for quiz sessions
- Uses `node-schedule` for job scheduling
- Jobs named: `Course_{courseId}_scheduledQuiz_{scheduledQuizId}`
- Refresh notifications when courses update: `refreshCourseNotifications(courseId)`

## Development Workflows

### Initial Setup

1. Copy `.env.example` to `.env`, configure MongoDB URI, Firebase credentials path
2. Generate MongoDB keyfile: `openssl rand -base64 756 > mongo-keyfile`
3. Create `mongo-init.js` from `mongo-init.js.example` (database initialization)
4. Ensure Firebase service account JSON at path specified in `GOOGLE_APPLICATION_CREDENTIALS`

### Build & Run

- **Development**: `npm run dev` (ts-node-dev with hot reload)
- **Production build**: `npm run build` (outputs to `dist/`)
- **Production start**: `npm start` (requires pre-built `dist/`)
- **Node.js requirement**: **Node.js 18 or higher is required** (Mongoose v9 compatibility). Ensure local, CI and Docker base images use Node >= 18 before upgrading Mongoose.
- **Linting**: `npm run lint` or `npm run lint:fix`
- **Type checking**: `npm run typecheck`
- **Docker**: `docker-compose up --build` (spins up app + 3-node MongoDB replica set)

### Schema Generation

**Important**: Run `npm run generate:schemas` before dev/build to auto-generate JSON schemas from TypeScript models for Swagger docs. This is done automatically by `predev` script. Script: `scripts/generateSchemas.js`.

### Pre-commit Hooks

Husky + lint-staged runs ESLint and Prettier on staged `.ts`/`.tsx`/`.js` files automatically.

## Project Conventions

### Error Handling

- Use numeric enums for status codes (e.g., `RegisterStatus`, `AuthenticateStatus`) in action methods
- Always wrap async operations in try-catch, log errors with `logger.error(err)`
- Return appropriate HTTP status codes with descriptive error messages
- Example: `methods/userActions.ts`

### Mongoose Models

- Define TypeScript interfaces for document shape, methods, and statics
- Export typed model: `export const ModelName = mongoose.model<DocType, ModelType>(...)`
- Use `HydratedDocument<Interface, Methods>` for document type with methods
- Example: `models/user.ts`

### Route Organization

- Group related endpoints by entity/feature in `secureRoutes.ts`
- Use JSDoc comments with `@swagger` tags for API documentation
- Keep handler logic thin - delegate to methods in `methods/`

### Validation

- JSON Schema validation using AJV (e.g., `middleware/jsonSchemaValidator.ts`)
- Generated schemas in `schemas/` directory (auto-generated, don't edit manually)
- Password validation: `methods/helperFunctions.ts` (min 8 chars, uppercase, lowercase, digit, special char)

### Permission System

- `models/permission.ts` tracks user access to resources (ACTIVITY, QUIZ, TOPIC, COURSE)
- Permission levels: READ < EDIT < EXECUTE < ADMIN (hierarchical)
- Check permissions: `middleware/permissionHelper.ts`

### Timezone

Server timezone set to `Europe/Amsterdam` in `server.ts` (`process.env.TZ`)

## Key Files Reference

- Authentication middleware: `middleware/auth.ts`
- DB connection with retry logic: `config/db.ts`
- Model population helpers: `middleware/modelHelper.ts`
- Image upload (GridFS): `methods/imageActions.ts`
- Swagger setup: `swagger.ts`
- Environment validation: `server.ts` (validateEnv function)

## Docker Notes

- Multi-stage build (`Dockerfile`): builder stage (includes devDependencies) + production stage (prod deps only)
- MongoDB replica set: 3 nodes (mongo1 primary, mongo2, mongo3) with keyfile authentication
- Keyfile permissions fixed by init service on Windows hosts
- Auto-restart policy: `unless-stopped`
- Separate network: `backend` for service isolation

## Testing & Debugging

### Common Debugging Scenarios

#### 1. Authentication Errors (401/404)

**Symptoms**: `401 Unauthorized` or `404 User account does not exist` on protected routes

**Debug checklist**:

- Verify JWT token format: `Authorization: Bearer <token>`
- Check `PUBLIC_KEY` env var is set correctly (matches private key used for signing)
- Inspect token expiration: tokens expire after 5 years but check `exp` claim
- Verify user exists in database: auth middleware queries UserModel by `_id` from token
- Check logs for: `JWT verification failed`, `Token expired`, or `Authentication failed for user id`

**Common causes**:

```typescript
// Missing Bearer prefix
headers: { 'Authorization': token } // ❌ Wrong
headers: { 'Authorization': `Bearer ${token}` } // ✅ Correct

// Token signed with wrong key or user deleted from DB
// Check middleware/auth.ts line 51-55 for user lookup failure
```

#### 2. MongoDB Connection Failures

**Symptoms**: `Failed to connect to DB - exiting` on startup, app crashes

**Debug checklist**:

- Verify `MONGO_URI` in `.env` (replica set format: `mongodb://mongo1:27017,mongo2:27018,mongo3:27019/...`)
- Check MongoDB containers are running: `docker ps | grep mongo`
- Verify replica set is initialized: `docker exec mongo1 mongosh --eval "rs.status()"`
- Check keyfile permissions (must be 400): handled by `keyfile-init` service in Docker
- Review connection retry logs in `log/output.log` - exponential backoff with jitter (see `config/db.ts`)

**Common causes**:

- Replica set not initialized (missing `rs.initiate()` in mongo-init)
- Wrong auth credentials in MONGO_URI vs mongo-init.js
- IPv6 issues (see README.md troubleshooting section)

#### 3. Transaction Failures

**Symptoms**: `MongoServerError: Transaction numbers are only allowed on a replica set member or mongos`

**Debug checklist**:

- MongoDB **must** be running as replica set for transactions
- Verify replica set status: `rs.status()` should show 3 members
- Check session is passed to all operations in transaction block
- Ensure `session.withTransaction()` is used (not manual `startTransaction()`)

**Common pattern**:

```typescript
// ✅ Correct - all operations use session
const session = await mongoose.startSession();
await session.withTransaction(async () => {
  await Model.create([doc], { session }); // Pass session here
  await OtherModel.updateOne({...}, {...}, { session }); // And here
});

// ❌ Wrong - missing session parameter
await Model.create([doc]); // Transaction won't work
```

#### 4. Firebase Initialization Errors

**Symptoms**: `Failed to initialize Firebase admin` during startup, notifications not sent

**Debug checklist**:

- Verify `GOOGLE_APPLICATION_CREDENTIALS` env var points to valid service account JSON
- Check file exists and has correct permissions: `ls -la <path-to-json>`
- Ensure Firebase Cloud Messaging API (V1) is enabled in Firebase Console
- Review Firebase service account has correct IAM permissions
- App continues without Firebase on failure (non-fatal error)

**Logs to check**: `server.ts` line 65, 156-159

#### 5. Custom Status Code Errors (452, 453, etc.)

**Symptoms**: Non-standard HTTP status codes in responses

**Project convention**: Custom error codes used for client-specific error handling:

- `452`: Generic validation failure (wrong credentials, invalid input, resource not found)
- `453`: Secondary validation failure (e.g., password too weak, limit reached)
- `454`: Tertiary validation failure
- `500`: Internal server error

**Examples from codebase**:

```typescript
// userActions.ts
UsernameExists = 452,
InvalidPassword = 452,
InvalidNewPassword = 453,
InvalidUsername = 454,
```

**Debug tip**: Search for enum definition near error status to understand specific failure reason

#### 6. JSON Parsing Errors

**Symptoms**: `The JSON in the request body could not be parsed` (400 error)

**Debug checklist**:

- Check request Content-Type header: `application/json`
- Validate JSON syntax (trailing commas, unquoted keys, etc.)
- Check payload size (limit: 50MB, see `server.ts` express.json config)
- Review request logger logs for malformed body

**Handled by**: Custom error middleware in `server.ts` lines 196-208

#### 7. Schema Validation Failures

**Symptoms**: Mongoose validation errors, missing required fields

**Debug checklist**:

- Run `npm run generate:schemas` if TypeScript models changed
- Check Swagger schema matches model definition: `/api-docs` endpoint
- Verify all required fields in request body match model schema
- Review AJV validation errors (e.g., `middleware/jsonSchemaValidator.ts`)

**Regeneration needed after**: Any changes to files in `models/` directory

#### 8. Graceful Shutdown Issues

**Symptoms**: Logs not flushed, connections left open, dirty shutdown

**Sequence** (see `server.ts` gracefulShutdown function):

1. Server stops accepting new connections
2. Wait 300ms for existing requests
3. Shutdown Firebase/node-schedule jobs
4. Close MongoDB connection
5. Flush rotating log file streams

**Debug tip**: Check for `Started graceful shutdown...` and subsequent completion logs

#### 9. GridFS Image Upload/Download Errors

**Symptoms**: `500` error on image operations, `Cannot download the Image!` (404)

**Debug checklist**:

- Verify GridFS collections exist: `<bucket>.files` and `<bucket>.chunks`
- Check bucket env vars: `DATABASE_IMAGE_BUCKET`, `GALLERY_BUCKET`
- Review GridFS metadata indexes created at startup (`config/db.ts` lines 16-31)
- Inspect file metadata: `db.images.files.findOne()`

**Common causes**: Missing replica set, index creation warnings logged but non-fatal

### Debugging Tools

- **Logs**: Check `log/output.log` (app logs) and `log/request-*.log` (HTTP logs)
- **Log levels**: Set `LOG_LEVEL` env var (debug, info, warn, error)
- **MongoDB shell**: `docker exec -it mongo1 mongosh -u <user> -p <pass> --authenticationDatabase admin`
- **VS Code debugger**: Attach to ts-node-dev process (port configured in launch.json)
- **Health check**: `GET /health` endpoint returns `OK` if server running

## Common Tasks

- **Add new route**: Update `routes/secureRoutes.ts`, add handler in `methods/`, add Swagger docs
- **Add new model**: Create in `models/`, define TypeScript types, run `npm run generate:schemas`
- **Modify authentication**: Update `middleware/auth.ts` and type definitions in `types/express.d.ts`
- **Schedule notifications**: Use `firebaseHelper.scheduleJobsForCourseScheduledQuizzes()` pattern
