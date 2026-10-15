FROM node:24-bookworm-slim AS packages
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM packages AS production-dependencies
RUN pnpm prune --prod --ignore-scripts

FROM packages AS dependencies
COPY . .

FROM dependencies AS build
RUN pnpm build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/public-build ./public-build
COPY --from=build /app/content/catalog.json ./content/catalog.json
COPY --from=build /app/content/news.json ./content/news.json
COPY --from=build /app/server/schema.sql ./server/schema.sql
ENV NODE_ENV=production
USER node
EXPOSE 3339
CMD ["node", "dist/server/index.js"]
