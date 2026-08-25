FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* tsconfig.json tsconfig.check.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/scheduler/package.json ./apps/scheduler/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/queues/package.json ./packages/queues/package.json
COPY packages/integrations/package.json ./packages/integrations/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/validation/package.json ./packages/validation/package.json
RUN npm install --include=dev
COPY apps ./apps
COPY packages ./packages
COPY tests ./tests
RUN npm run db:generate
RUN npm run build

FROM build AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /storage/exports /storage/logs /storage/backups && chown -R node:node /storage
USER node
CMD ["npm","run","start","-w","@prospector/api"]
