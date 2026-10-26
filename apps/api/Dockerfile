# Production image for the API (built from the repository root: see deploy/docker-compose.yml).
FROM node:20-bookworm-slim

# openssl: required by the Prisma query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@10.13.1

WORKDIR /app
# Workspace manifests first, so `pnpm install` is cached until dependencies change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter api...

COPY apps/api apps/api
RUN pnpm --filter api exec prisma generate && pnpm --filter api build

# Uploaded files / raw receipts live on a volume mounted at /data.
RUN mkdir -p /data/storage && chown -R node:node /app /data
USER node
WORKDIR /app/apps/api
EXPOSE 4000
# Apply pending migrations, then start. Dev dependencies stay installed so `pnpm seed` works.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
