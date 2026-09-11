# Kaito — production image.
# node:*-slim (Debian) rather than Alpine: better-sqlite3 ships prebuilt binaries
# for glibc, so this needs no compiler and builds in seconds.
FROM node:24-slim

# dumb-init makes PID 1 forward SIGTERM properly, so Kaito's graceful shutdown
# actually runs when the platform stops the container.
RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# Copy manifests first: this layer is cached unless dependencies change.
COPY package*.json ./
RUN npm ci --omit=dev

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
