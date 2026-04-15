FROM node:20-alpine AS builder
WORKDIR /repo

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter shared-libs build
RUN pnpm --filter @nunncorp/reporting-manifest build
RUN pnpm --filter sentinel-api build

FROM node:20-alpine AS runner
WORKDIR /repo/apps/sentinel-api
ENV NODE_ENV=production

COPY --from=builder /repo /repo

EXPOSE 4000
CMD ["node", "dist/index.js"]
