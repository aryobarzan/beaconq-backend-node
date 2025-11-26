# Dockerfile for TypeScript Node.js Application
# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Generate schemas for interactive API docs (swagger)
RUN npm run generate:schemas
# build TypeScript -> output to /dist
RUN npm run build

# Stage 2: Production
FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --omit=dev --ignore-scripts && \
    npm upgrade jwa && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/schemas ./dist/schemas
# COPY --from=builder /app/dist/schemas ./dist/schemas

# Copy necessary runtime files
COPY mongo-init.js ./
COPY beaconQ_config ./beaconQ_config
COPY routes ./dist/routes

# Create log directory and set ownership
# NOTE: do not apply chown to /app, as this will take much longer and is unnecessary.
# NOTE 2: Logs are written to /app/dist/log (based on global.appRoot)
RUN mkdir -p /app/dist/log && \
    chown -R node:node /app/dist/log

# Use non-root user
USER node

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/server.js"]
