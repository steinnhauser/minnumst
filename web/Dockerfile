FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=http://127.0.0.1:8000
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN npm install --global serve@14.2.4
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 8080

CMD ["serve", "--single", "--listen", "tcp://0.0.0.0:8080", "dist"]
