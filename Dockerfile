# Multi-stage build: frontend (Vite) → backend (Hono on Node) with the SPA
# bundled into server/public for same-origin serving on Fly.io.

# ===== Stage 1: build the frontend =====
FROM node:22-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ===== Stage 2: build the backend =====
FROM node:22-slim AS backend
WORKDIR /app/server

# better-sqlite3 needs a C toolchain for native module compile.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY server ./
RUN npm run build

# ===== Stage 3: runtime image =====
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/app.db
ENV DATA_DIR=/data
ENV PUBLIC_DIR=/app/public

# Runtime deps for better-sqlite3 prebuild (no toolchain needed at run time
# since we copy the already-built node_modules from the backend stage).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy built backend
COPY --from=backend /app/server/dist ./dist
COPY --from=backend /app/server/package.json ./package.json
COPY --from=backend /app/server/node_modules ./node_modules
# Copy built frontend into the location the server expects
COPY --from=frontend /app/dist ./public

# /data is mounted at runtime from a Fly volume; pre-create the mount point.
RUN mkdir -p /data/uploads

EXPOSE 8080
CMD ["node", "dist/index.js"]
