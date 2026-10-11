# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# @iterahq/activity-spec is a PRIVATE package on GitHub Packages. Until #275 it
# was vendored as `file:vendor/iterahq-activity-spec-0.7.0.tgz` precisely
# BECAUSE this image build has no registry auth. #275 made it a normal `^0.7.0`
# dependency and deleted `vendor/` — but left `COPY vendor ./vendor` here, so
# the very next Dokploy deploy (d0e309b) died on `"/vendor": not found`, and
# every deploy after it too. Removing the COPY alone is NOT enough: `npm ci`
# then reaches npm.pkg.github.com unauthenticated and gets `401`.
#
# The token arrives as a BuildKit **secret**, never as an ARG/ENV: an ARG value
# is recorded in `docker history` and would ship the credential inside the
# image. Dokploy passes an app's "Build Secrets" as `--secret type=env,id=<KEY>`
# (verified in the RUNNING @dokploy/server v0.29.0,
# src/utils/builders/docker-file.ts), which BuildKit materialises at
# /run/secrets/<KEY>.
#
# `required=true` is deliberate: without it a missing secret mounts an EMPTY
# file, npm sends an empty bearer and the build dies on an opaque `401` from
# the registry. With it, BuildKit fails up front naming the secret id.
#
# ⚠️ REQUIRED Dokploy config for this Dockerfile to build: a build secret named
# NODE_AUTH_TOKEN holding a **classic** PAT with `read:packages` (the GitHub
# Packages npm registry rejects fine-grained PATs). The org-owner "Actions
# access" grant does NOT help here — it only widens what a GitHub Actions
# `GITHUB_TOKEN` may read, and a Dokploy build has no Actions token.
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app
# .npmrc carries legacy-peer-deps=true — required for `npm ci` to resolve the
# peer-dep graph cleanly (else ERESOLVE). It also routes the @iterahq scope to
# npm.pkg.github.com and reads ${NODE_AUTH_TOKEN}. Must be copied BEFORE npm ci.
COPY package.json package-lock.json .npmrc ./
# `@iterahq/activities` is an in-repo WORKSPACE (packages/activities). npm ci
# writes it as a symlink whose target only lands with the `COPY . .` below —
# a dangling link here is expected and fine. A source-only workspace (packages/bridge) has no
# build output either, so vite.config.ts aliases it; scripts/workspace-alias.test.ts keeps that true.
RUN --mount=type=secret,id=NODE_AUTH_TOKEN,required=true \
    NODE_AUTH_TOKEN="$(cat /run/secrets/NODE_AUTH_TOKEN)" \
    npm ci
COPY . .
# Vite inlines import.meta.env.VITE_* at BUILD time, so these must be build args.
# Dokploy passes the app's Build Args here (configured via the app's buildArgs).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_OTEL_ENABLED=false
# Hackathon: the telemetry package ignores VITE_OTEL_ENABLED in a production build;
# only VITE_OTEL_DISABLED=true stops it from posting traces to the DFL collector.
ARG VITE_OTEL_DISABLED=true
ARG VITE_ITERA_API_BASE
# Hackathon: without this the app falls back to the production api.iterahq.dev.
ARG VITE_ITERA_API_URL
ARG VITE_UMAMI_WEBSITE_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_OTEL_ENABLED=$VITE_OTEL_ENABLED \
    VITE_OTEL_DISABLED=$VITE_OTEL_DISABLED \
    VITE_ITERA_API_BASE=$VITE_ITERA_API_BASE \
    VITE_ITERA_API_URL=$VITE_ITERA_API_URL \
    VITE_UMAMI_WEBSITE_ID=$VITE_UMAMI_WEBSITE_ID
# Belt-and-suspenders cache-bust: a changing GIT_SHA busts the build layer
# cache on every commit (defends against BuildKit content-hash cross-commit matches).
ARG GIT_SHA
ENV VITE_BUILD_SHA=$GIT_SHA
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# nginx config and the security-header snippet are files, not a printf: `docker/nginx.conf` and
# `docker/nginx-headers.conf` (HSTS, nosniff, Referrer-Policy, CSP with frame-ancestors).
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/nginx-headers.conf /etc/nginx/snippets/itera-headers.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
