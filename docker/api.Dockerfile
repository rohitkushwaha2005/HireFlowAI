# syntax=docker/dockerfile:1.7
# HireFlow API + worker image (same image, different command).

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY packages/database/prisma packages/database/prisma
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @hireflow/api...
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @hireflow/database generate && pnpm --filter @hireflow/api build
# Self-contained production node_modules for the API package.
RUN pnpm --filter @hireflow/api deploy --prod --legacy /out && \
    cp -r apps/api/dist /out/dist && \
    cp -r packages/database/prisma /out/prisma && \
    cd /out && npx prisma@6 generate --schema prisma/schema.prisma

FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && groupadd --system app && useradd --system --gid app --home /app app
WORKDIR /app
ENV NODE_ENV=production EMBEDDING_CACHE_DIR=/app/.cache/models
COPY --from=build --chown=app:app /out ./
RUN mkdir -p /app/.cache/models /app/.storage && chown -R app:app /app/.cache /app/.storage
USER app
EXPOSE 4000
CMD ["node", "dist/server.js"]
