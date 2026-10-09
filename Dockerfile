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
ARG VITE_ITERA_API_BASE
# Hackathon: without this the app falls back to the production api.iterahq.dev.
ARG VITE_ITERA_API_URL
ARG VITE_UMAMI_WEBSITE_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_OTEL_ENABLED=$VITE_OTEL_ENABLED \
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
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  # ADR itera-edge-allow-framing-by-learn: scope embedding to learn.devfellowship.com\n\
  # (+ localhost for dev). MUST NOT send X-Frame-Options (would block the iframe).\n\
  add_header Content-Security-Policy "frame-ancestors '"'"'self'"'"' https://learn.devfellowship.com http://localhost:* http://127.0.0.1:*" always;\n\
  # The bundle went out uncompressed (1.5 MB of JS on a phone). The proxy in front does not compress,\n\
  # so nginx does; text/html is always included. gzip_proxied: the request arrives through a proxy.\n\
  gzip on;\n\
  gzip_comp_level 6;\n\
  gzip_min_length 1024;\n\
  gzip_proxied any;\n\
  gzip_vary on;\n\
  gzip_types text/css application/javascript application/json image/svg+xml text/plain application/manifest+json;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
  # Vite names every file in /assets/ after its content, so a year and immutable. A name that is gone\n\
  # (a tab older than the last deploy) is a 404, not index.html. add_header here replaces the\n\
  # server-level one, so the CSP is repeated. No "always" on Cache-Control: a 404 must not be kept.\n\
  location /assets/ {\n\
    add_header Cache-Control "public, max-age=31536000, immutable";\n\
    add_header Content-Security-Policy "frame-ancestors '"'"'self'"'"' https://learn.devfellowship.com http://localhost:* http://127.0.0.1:*" always;\n\
    try_files $uri =404;\n\
  }\n\
  # The shell reads this file at every launch: a changed value must reach it at once. add_header here\n\
  # replaces the server-level one, which is fine for a JSON file. A missing file is a 404, not index.html.\n\
  location = /shell-config.json {\n\
    add_header Cache-Control "no-cache" always;\n\
    try_files $uri =404;\n\
  }\n\
  # R-5: the files an OS fetches to verify universal links / App Links. Exact paths, 200 with JSON, never the\n\
  # SPA fallback and never a redirect (both OSes refuse a redirect). The iOS file has no extension, so nginx\n\
  # would type it octet-stream: default_type says JSON. Not compressed. A missing file is a 404.\n\
  location = /.well-known/apple-app-site-association {\n\
    default_type application/json;\n\
    gzip off;\n\
    add_header Cache-Control "no-cache" always;\n\
    try_files $uri =404;\n\
  }\n\
  location = /.well-known/assetlinks.json {\n\
    default_type application/json;\n\
    gzip off;\n\
    add_header Cache-Control "no-cache" always;\n\
    try_files $uri =404;\n\
  }\n\
  # Lesson images and clips: static and unhashed, and re-cut now and then, so a day and not immutable.\n\
  # Without this they had no cache header at all and a phone asked for them again on every visit. A\n\
  # missing file is a 404, not index.html (an <img> fed HTML never finishes loading).\n\
  location /lesson-media/ {\n\
    add_header Cache-Control "public, max-age=86400";\n\
    add_header Content-Security-Policy "frame-ancestors '"'"'self'"'"' https://learn.devfellowship.com http://localhost:* http://127.0.0.1:*" always;\n\
    try_files $uri =404;\n\
  }\n\
  # Feedback clips: static and unhashed, so a week and not immutable. Without this they had no cache\n\
  # header at all. add_header here replaces the server-level one, so the CSP is repeated. No "always" on\n\
  # Cache-Control: a 404 must not be kept for a week.\n\
  location /vendor/sfx/ {\n\
    add_header Cache-Control "public, max-age=604800";\n\
    add_header Content-Security-Policy "frame-ancestors '"'"'self'"'"' https://learn.devfellowship.com http://localhost:* http://127.0.0.1:*" always;\n\
    try_files $uri =404;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
