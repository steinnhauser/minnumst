# One image definition for both frontends. Build from the repository root:
#   docker build -f docker/frontend.Dockerfile --build-arg APP=web \
#     --build-arg SERVICE_NAME=minnumst-public .
#   docker build -f docker/frontend.Dockerfile --build-arg APP=admin \
#     --build-arg SERVICE_NAME=minnumst-admin \
#     --build-arg RUNTIME_CONFIG_KEYS="VITE_API_URL DEBUG" .

# Workspace manifests, shared by the install stages below.
FROM node:22-alpine AS manifests
WORKDIR /repo
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY admin/package.json admin/
COPY packages/static-server/package.json packages/static-server/

FROM manifests AS build
ARG APP
RUN test "$APP" = web || test "$APP" = admin
RUN npm ci
COPY tsconfig.base.json ./
COPY ${APP}/ ${APP}/
RUN npm run build --workspace "$APP"

# The runtime only needs the static server's dependencies; React is bundled into dist/.
FROM manifests AS server-deps
RUN npm ci --omit=dev --workspace @minnumst/static-server

FROM node:22-alpine
ARG APP
ARG SERVICE_NAME
ARG RUNTIME_CONFIG_KEYS=VITE_API_URL
ENV NODE_ENV=production \
    SERVICE_NAME=${SERVICE_NAME} \
    RUNTIME_CONFIG_KEYS=${RUNTIME_CONFIG_KEYS}
WORKDIR /app

COPY --from=server-deps --chown=node:node /repo/node_modules ./node_modules
COPY --chown=node:node packages/static-server/logging.mjs packages/static-server/runtime-config.mjs packages/static-server/server.mjs ./
COPY --from=build --chown=node:node /repo/${APP}/dist ./dist

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/runtime-config.js"]

# runtime-config.mjs writes dist/runtime-config.js from the listed variables.
CMD ["sh", "-c", "node runtime-config.mjs $RUNTIME_CONFIG_KEYS && exec node server.mjs"]
