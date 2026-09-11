# Kaito — production image.
#
# Two stages. better-sqlite3 v13 publishes no prebuilt binaries, so on Linux it
# always compiles SQLite from source — that needs Python and a C++ toolchain.
# Stage 1 has the toolchain and builds node_modules; stage 2 copies only the
# result, so the image that actually runs stays slim with no compiler inside.
#
# Both stages use the same base image: a native module must run against the
# same Node version and C library it was compiled with.

# ── Stage 1: install + compile dependencies ────────────────────────────────
FROM node:24-slim AS deps

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests first: this layer is cached unless dependencies change,
# so the slow compile only reruns when package*.json does.
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: runtime ───────────────────────────────────────────────────────
FROM node:24-slim

# dumb-init makes PID 1 forward SIGTERM properly, so Kaito's graceful shutdown
# actually runs when the platform stops the container.
RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Where the SQLite file lives. Mount a volume here in production, or the
# database is wiped on every redeploy — see SETUP.md step 8.
# No `VOLUME` instruction on purpose: Railway rejects Dockerfiles that use it,
# and every host (Railway, Fly, a VPS) attaches the mount at runtime anyway.
RUN mkdir -p /app/data
ENV DATABASE_PATH=/app/data/kaito.db

# Drop root. The node image ships an unprivileged `node` user.
RUN chown -R node:node /app
USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
