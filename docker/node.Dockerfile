# Upvine API / worker / web için ortak çok aşamalı Dockerfile.
# Kullanım:
#   docker build -f docker/node.Dockerfile --build-arg APP=api    -t upvine-api .
#   docker build -f docker/node.Dockerfile --build-arg APP=worker -t upvine-worker .
#   docker build -f docker/node.Dockerfile --build-arg APP=web    -t upvine-web .
# Not: Production yayın rehberi Faz 7'de; bu dosya Faz 0 iskeletidir.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG APP
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @upvine/${APP} build
# Sadece production bağımlılıkları
RUN pnpm install --frozen-lockfile --prod --ignore-scripts=false

FROM ${NODE_IMAGE} AS runtime
ARG APP
ENV NODE_ENV=production APP=${APP}
WORKDIR /repo
RUN groupadd --system upvine && useradd --system --gid upvine upvine
COPY --from=build --chown=upvine:upvine /repo/node_modules ./node_modules
COPY --from=build --chown=upvine:upvine /repo/apps/${APP} ./apps/${APP}
COPY --from=build --chown=upvine:upvine /repo/package.json ./package.json
USER upvine
WORKDIR /repo/apps/${APP}
EXPOSE 4000 3000
CMD ["sh", "-c", "if [ \"$APP\" = web ]; then node ../../node_modules/@react-router/serve/bin.cjs ./build/server/index.js; else node dist/index.js; fi"]
