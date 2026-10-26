# Production image for the web app (built from the repository root: see deploy/docker-compose.yml).
FROM node:20-bookworm-slim
RUN npm install -g pnpm@10.13.1
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter web...

COPY apps/web apps/web
# Caddy sends /api and /socket.io straight to the API, so these are only fallbacks.
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
RUN pnpm --filter web build && chown -R node:node /app

USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
