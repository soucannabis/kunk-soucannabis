# SPA production image for monorepo Vite apps (admin, kunk, registration, doc-sign).
# Build context: repository root.
# Required build-args / Railway vars:
#   APP_DIR        e.g. apps/admin
#   APP_WORKSPACE  e.g. @kunk/admin
# Vite envs (VITE_*) must be present at build time as Railway service variables.

ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-bookworm-slim AS build

WORKDIR /app

ARG APP_DIR=apps/admin
ARG APP_WORKSPACE=@kunk/admin

# Vite bake-time public config (override via Railway service variables / build args)
ARG VITE_API_URL=/api/v1
ARG VITE_URL=
ARG VITE_DOC_SIGN_URL=
ARG VITE_KUNK_URL=
ARG VITE_REGISTRATION_URL=
ARG VITE_CONTACT_URL=
ARG VITE_ASSOCIATION_NAME=
ARG VITE_ASSOCIATION_LOGO=
ARG VITE_ASSOCIATION_LOGO_MENU=
ARG VITE_ASSOCIATION_LOGO_SIZE=

ENV VITE_API_URL=$VITE_API_URL \
    VITE_URL=$VITE_URL \
    VITE_DOC_SIGN_URL=$VITE_DOC_SIGN_URL \
    VITE_KUNK_URL=$VITE_KUNK_URL \
    VITE_REGISTRATION_URL=$VITE_REGISTRATION_URL \
    VITE_CONTACT_URL=$VITE_CONTACT_URL \
    VITE_ASSOCIATION_NAME=$VITE_ASSOCIATION_NAME \
    VITE_ASSOCIATION_LOGO=$VITE_ASSOCIATION_LOGO \
    VITE_ASSOCIATION_LOGO_MENU=$VITE_ASSOCIATION_LOGO_MENU \
    VITE_ASSOCIATION_LOGO_SIZE=$VITE_ASSOCIATION_LOGO_SIZE

COPY package.json package-lock.json ./
COPY apps/admin/package.json ./apps/admin/
COPY apps/registration/package.json ./apps/registration/
COPY apps/kunk/package.json ./apps/kunk/
COPY apps/doc-sign/package.json ./apps/doc-sign/
COPY packages ./packages

RUN npm ci

COPY ${APP_DIR} ./${APP_DIR}

RUN npm run build -w ${APP_WORKSPACE}

FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache gettext \
  && rm -f /etc/nginx/conf.d/default.conf \
  && sed -i 's/listen\s\+80;/listen 8080;/' /etc/nginx/conf.d/default.conf 2>/dev/null || true

# nginx main config already includes conf.d/*.conf; we only render a server block.
COPY deploy/spa/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/spa/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ARG APP_DIR=apps/admin
COPY --from=build /app/${APP_DIR}/dist /usr/share/nginx/html

ENV PORT=8080 \
    KUNK_API_PUBLIC_HOST=kunk-api-production.up.railway.app

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
