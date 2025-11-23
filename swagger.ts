import swaggerJsdoc from 'swagger-jsdoc';
import fs from 'fs';
import path from 'path';

// load schema (.json) files from schemas/
const schemasDir = path.join(__dirname, 'schemas');
const allSchemas: Record<string, any> = {};

// read each schema file
if (fs.existsSync(schemasDir)) {
    fs.readdirSync(schemasDir)
        .filter(file => file.endsWith('.json'))
        .forEach(file => {
            const schemaPath = path.join(schemasDir, file);
            const schemaContent = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

            // merge schema definitions contained within this file into the full list allSchemas
            if (schemaContent.definitions) {
                Object.assign(allSchemas, schemaContent.definitions);
            }
        });
}

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'BEACON Q - Backend API',
            version: '1.0.0',
            description: 'Backend API for BEACON Q learning platform',
        },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: allSchemas,
        },
    },
    apis: ['./routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);