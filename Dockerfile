# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.6.2

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source files
COPY tsconfig.json biome.json ./
COPY src/ ./src/

# Build
RUN pnpm build

# Stage 2: Production
FROM node:22-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -S mcp && adduser -S mcp -G mcp

# Install pnpm
RUN npm install -g pnpm@10.6.2

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod \
    && pnpm store prune

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R mcp:mcp /app

# Set environment
ENV NODE_ENV=production

# Switch to non-root user
USER mcp

# Labels
LABEL org.opencontainers.image.title="newrelic-mcp-server" \
      org.opencontainers.image.description="Full-featured NewRelic MCP server with 26+ tools" \
      org.opencontainers.image.source="https://github.com/ruminaider/newrelic-mcp-server"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Run the server
CMD ["node", "dist/index.js"]
