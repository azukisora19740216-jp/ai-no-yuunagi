# syntax=docker/dockerfile:1.7
FROM node:26.5.0-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS development
COPY . .
RUN pnpm db:generate
EXPOSE 3000
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]

FROM dependencies AS build
COPY . .
ENV APP_URL=http://127.0.0.1:3000 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    AUTH_SECRET=container-build-authentication-secret-123456 \
    ALLOW_MOCK_ADAPTERS=false \
    EMAIL_DRIVER=external \
    KYC_DRIVER=external \
    SHIPPING_DRIVER=external \
    STORAGE_DRIVER=s3 \
    S3_ENDPOINT=http://127.0.0.1:9000 \
    S3_REGION=build \
    S3_BUCKET=build \
    S3_ACCESS_KEY_ID=build \
    S3_SECRET_ACCESS_KEY=build \
    SMTP_HOST=127.0.0.1 \
    SMTP_PORT=1025 \
    MAIL_FROM=no-reply@example.invalid
RUN pnpm db:generate && pnpm build

FROM node:26.5.0-alpine AS production
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
