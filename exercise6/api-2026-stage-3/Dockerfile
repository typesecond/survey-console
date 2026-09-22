FROM node:22-alpine AS build

WORKDIR /app

RUN apk add --no-cache tini

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY eslint.config.js ./
COPY config ./config
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src ./src
COPY drizzle.config.ts ./

RUN npm run build:ts

FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache tini

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/config ./config
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package*.json ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
