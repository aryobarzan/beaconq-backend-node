const tsj = require('ts-json-schema-generator');
const fs = require('fs');
const path = require('path');

// ============================================================
// Swagger (OpenAPI) schema generator
// run (defined in package.json > scripts): npm run generate:schemas
// ============================================================
/**
 * Run this script to automatically generate the associated JSON schemas from all TypeScript interfaces and types exported in models/
 * Each model file gets its own schema file in schemas/
 * These schema definitions are then used in swagger.ts
 */

const MODELS_DIR = path.join(__dirname, '../models');
const SCHEMAS_DIR = path.join(__dirname, '../schemas');
const EXCLUDED_DIRS = ['archive']; // directories to skip

/**
 * Recursively find all .ts files in a directory
 */
function findTypeScriptFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    // get info about file
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // skip if part of excluded directories
      if (!EXCLUDED_DIRS.includes(file)) {
        // otherwise, go through its contents
        findTypeScriptFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts')) {
      // if not a directory, retain if extension is .ts
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Extract exported interface/type names from a TypeScript (.ts) file
 */
function getExportedTypes(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const exportedTypes = [];

  // Match: "export interface Name", "export type Name"
  // \s+ - one or more whitespace (space, tab, newline)
  // ?: - non-capturing group, i.e., when the word "interface" or "type" is matched, don't actually capture it
  // (\w+) - capturing group, i.e., capture one or more word characters (letter, number, underscore) -> gives us name of the interface/type
  // g - global flag, i.e., find all matches rather than stopping after the first match
  const interfaceTypeRegex = /export\s+(?:interface|type)\s+(\w+)/g;
  let match;

  while (
    (match = interfaceTypeRegex.exec(content)) !== null &&
    match.length > 1
  ) {
    const typeName = match[1];
    // skip if "Document" (HydratedDocument) type, e.g., ActivityDocument
    if (!typeName.endsWith('Document')) {
      exportedTypes.push(typeName);
    }
  }

  return exportedTypes;
}

try {
  console.log(
    'Running script (generateSchemas.js) to auto-generate JSON schemas from TypeScript model files...'
  );
  console.log('🔍 Scanning models directory...');
  const startTime = performance.now();

  // create schemas/ directory if it doesn't exist
  fs.mkdirSync(SCHEMAS_DIR, { recursive: true });

  // find TypeScript (.ts) files
  const tsFiles = findTypeScriptFiles(MODELS_DIR);
  console.log(`📁 Found ${tsFiles.length} TypeScript file(s):\n`);

  let totalSchemas = 0;
  const generatedFiles = [];

  // analyze each .ts file
  for (const filePath of tsFiles) {
    const relativePath = path.relative(path.join(__dirname, '..'), filePath);
    const fileName = path.basename(filePath, '.ts');
    const exportedTypes = getExportedTypes(filePath);

    if (exportedTypes.length === 0) {
      console.log(`⏭️  ${relativePath} - No exported types found, skipping...`);
      continue;
    }

    console.log(`📝 ${relativePath}`);
    console.log(`   Types: ${exportedTypes.join(', ')}`);

    const config = {
      path: filePath,
      tsconfig: path.join(__dirname, '..', 'tsconfig.json'),
      type: '*',
      expose: 'export',
      jsDoc: 'extended',
      skipTypeCheck: false,
      additionalProperties: false,
    };

    const fileSchemas = {};
    try {
      const generator = tsj.createGenerator(config);
      // generate schema for each exported type
      for (const typeName of exportedTypes) {
        try {
          const schema = generator.createSchema(typeName);

          // extract the definition for this type
          if (schema.definitions && schema.definitions[typeName]) {
            fileSchemas[typeName] = schema.definitions[typeName];
            totalSchemas++;
            console.log(`   ✅ ${typeName}`);
          }
        } catch (error) {
          console.log(`   ⚠️  ${typeName} - ${error.message}`);
        }
      }
      // write schemas for this .ts file to its own .json schema file
      if (Object.keys(fileSchemas).length > 0) {
        const outputPath = path.join(SCHEMAS_DIR, `${fileName}.json`);
        const output = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          $id: `${fileName}.json`,
          definitions: fileSchemas,
        };

        let jsonOutput = JSON.stringify(output, null, 2);

        // FIX: replace mongoose.Types.ObjectId with string type
        // This fixes "Could not resolve pointer: /definitions/Types.ObjectId"
        jsonOutput = jsonOutput.replace(
          /"\$ref":\s*"#\/definitions\/Types\.ObjectId"/g,
          '"type": "string"'
        );

        // FIX: rewrite local definitions refs to swagger components refs
        // This fixes "Could not resolve pointer: /definitions/CodeBlock" when merged into swagger
        // e.g., "#/definitions/CodeBlock" -> "#/components/schemas/CodeBlock"
        jsonOutput = jsonOutput.replace(
          /"\$ref":\s*"#\/definitions\/([^"]+)"/g,
          '"$ref": "#/components/schemas/$1"'
        );

        fs.writeFileSync(outputPath, jsonOutput);
        generatedFiles.push(`${fileName}.json`);
        console.log(`   💾 Saved to schemas/${fileName}.json`);
      }
    } catch (error) {
      console.log(`   ❌ Error processing file: ${error.message}`);
    }
    console.log('');
  }
  const endTime = performance.now();

  console.log(
    `✅ Schema generation complete! (${((endTime - startTime) / 1000).toFixed(2)}s)`
  );
  console.log(
    `📊 Generated ${totalSchemas} schemas in ${generatedFiles.length} file(s)`
  );
  console.log(`📁 Output directory: ${SCHEMAS_DIR}\n`);

  console.log('Generated files:');
  generatedFiles.forEach((file) => console.log(`  - ${file}`));
  console.log('');
} catch (error) {
  console.error('\n❌ Error generating schemas:', error);
  process.exit(1);
}
