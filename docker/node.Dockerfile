# syntax=docker/dockerfile:1.7
# Kitisel production imajı: API, worker, web (SSR) ve veritabanı komutları tek imajda; hangi sürecin
# çalışacağını docker-compose.prod.yml'deki `command` belirler.
#
#   docker compose -f docker-compose.prod.yml --env-file .env.production build
#
# Web paketine gömülen herkese açık değerler (Turnstile / reCAPTCHA site anahtarları) derleme anında
# build-arg olarak gelir; gizli anahtarlar imaja girmez, çalışma anında env_file'dan okunur.

ARG NODE_IMAGE=node:24.18.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
ARG TURNSTILE_SITE_KEY=""
ARG RECAPTCHA_SITE_KEY=""
ENV TURNSTILE_SITE_KEY=${TURNSTILE_SITE_KEY} RECAPTCHA_SITE_KEY=${RECAPTCHA_SITE_KEY}
RUN pnpm --filter @upvine/db --filter @upvine/api --filter @upvine/worker --filter @upvine/web build
# Çalışma imajına sadece production bağımlılıkları
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --prod

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Hoisted node_modules ve uygulama başına iç içe node_modules klasörleri dahil tüm depo (kaynaklar küçük)
COPY --from=build --chown=node:node /repo /app
USER node
EXPOSE 4000 3000
CMD ["node", "apps/api/dist/index.js"]
