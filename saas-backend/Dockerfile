# =============================================================
# saas-backend — Multi-stage Dockerfile
# =============================================================

# ── Stage 1: install production deps ─────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests only (layer caching: only re-runs if package.json changes)
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev --ignore-scripts

# ── Stage 2: test image (has devDependencies — jest, supertest) ──
FROM node:20-alpine AS test

WORKDIR /app

COPY package*.json ./

# Install ALL deps (including jest, supertest)
RUN npm ci --ignore-scripts

# Copy full source (tests/ included)
COPY . .

ENV NODE_ENV=test

CMD ["npm", "test"]

# ── Stage 3: production image ─────────────────────────────────
FROM node:20-alpine AS production

# Security: run as non-root
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 --ingroup nodejs nodejs

WORKDIR /app

# Copy production node_modules from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy application source (owned by non-root user)
COPY --chown=nodejs:nodejs . .

# Drop root privileges
USER nodejs

EXPOSE 3000

# Healthcheck (Docker-native, also used by compose)
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Default: API server
# Worker overrides this with: node src/workers/index.js
CMD ["node", "src/server.js"]
