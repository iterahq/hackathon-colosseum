# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app
# .npmrc carries legacy-peer-deps=true — required for `npm ci` to resolve the
# peer-dep graph cleanly (else ERESOLVE). Must be copied BEFORE npm ci.
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
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
