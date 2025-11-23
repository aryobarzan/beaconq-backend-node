# API Documentation with Swagger

For the interactive API documentation of this project, **Swagger/OpenAPI 3.0** is used in conjunction with **automated JSON schema generation** (scripts/generateSchemas.js) from exported TypeScript interfaces and types in the models folder.

```
├── models/
│   └── activity.ts          # TypeScript interfaces and types
├── routes/
│   └── routes.ts            # Routes with @swagger JSDoc comments
│   └── secureRoutes.ts      # Routes with @swagger JSDoc comments
├── scripts/
│   └── generateSchemas.js   # Schema generation script (from models/ to schemas/)
├── schemas/
│   ├── activity.json        # Auto-generated schemas for activity.ts
│   └── ...                  # (one JSON file per model .ts file)
├── swagger.ts               # Swagger configuration (dynamically loads schemas)
└── server.js                # Swagger UI setup
```

## View API Documentation
Once the server is running, visit `http://localhost:PORT/api-docs`!

## Generate Schemas
Schemas are automatically generated when running the dev server or building:
```bash
npm run dev
# OR
npm run build
```

To manually regenerate them, use `npm run generate:schemas`.

### What the script does:
1. Scans all `.ts` files in `models/`
2. Extracts all exported interfaces and types
3. Generates schemas for each one (each .ts file gets its own separate .json schema file) in `schemas/`
   - Skips `Document` types (e.g., `ActivityDocument`)
   - Skips `models/archive/` subdirectory

## Document New Route

For each new route, add an associated `@swagger` JSDoc comment above its definition.

Example:
```typescript
/**
 * @swagger
 * /activities:
 *   post:
 *     summary: Create or update an activity
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Activity'
 *     responses:
 *       201:
 *         description: Activity created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Activity'
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
router.post("/activities", activityActions.createOrUpdateActivity);
```

## Add New Model

1. **Define TypeScript interfaces/types** in a .ts file in `models/`:
   ```typescript
   // models/newModel.ts
   export interface NewModel {
     title: string;
     description: string;
     // ...
   }
   ```
   - Note: The definition HAS to be exported, otherwise the schema generator script will not pick it up.

2. **Regenerate schemas** (manually):
   ```bash
   npm run generate:schemas
   ```

Step 2 is optional, as the schemas are always automatically generated when running the dev server or building the project, though it is still recommended to run the script manually before each new server deployment.

## Authentication

The API uses JWT Bearer token authentication. In the interactive API documentation of Swagger UI:

1. Click the **"Authorize"** button
2. Enter your JWT token in the format `Bearer YOUR_TOKEN_HERE`.
3. Click "Authorize"
4. All subsequent requests will include the token
