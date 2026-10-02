FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN npm install --global serve@14.2.4
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node runtime-config.mjs ./runtime-config.mjs

USER node
EXPOSE 8080

CMD ["sh", "-c", "node runtime-config.mjs && exec serve --single --listen tcp://0.0.0.0:8080 dist"]
