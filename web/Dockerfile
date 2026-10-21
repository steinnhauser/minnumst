FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node runtime-config.mjs ./runtime-config.mjs
COPY --chown=node:node server.mjs server-logging.mjs ./

USER node
EXPOSE 8080

CMD ["sh", "-c", "node runtime-config.mjs && exec node server.mjs"]
