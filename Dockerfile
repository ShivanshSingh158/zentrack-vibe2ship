# Dockerfile for DeadlineZero Orchestrator (Cloud Run)
# Based on the system design spec: "Orchestrator: Cloud Run (container, min 1 instance, max 10)"

# Use lightweight Node Alpine image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the TypeScript project (simulated build step for the backend orchestrator)
# In reality, this would compile the 'src/agent/orchestrator.ts' into a Node express server
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy production dependencies and built code
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist

# Install only production dependencies
RUN npm ci --omit=dev

# Expose Cloud Run default port
EXPOSE 8080

# Start the orchestrator service
CMD ["node", "dist/server.js"]
