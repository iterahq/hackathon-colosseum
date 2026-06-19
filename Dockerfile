# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app
# .npmrc carries legacy-peer-deps=true — required for `npm ci` to resolve the
# peer-dep graph cleanly (else ERESOLVE). Must be copied BEFORE npm ci.
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
# Vite inlines import.meta.env.VITE_* at BUILD time, so these must be build args.
# Dokploy passes the app's Build Args here (configured via the app's buildArgs).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_OTEL_ENABLED=false
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_OTEL_ENABLED=$VITE_OTEL_ENABLED
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
