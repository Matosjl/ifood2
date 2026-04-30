# Frontend Dockerfile - Node + Yarn otimizado
FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json yarn.lock ./
RUN corepack enable && corepack prepare yarn@stable --activate && yarn cache clean && yarn install --frozen-lockfile --network-timeout 600000

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && yarn build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/build ./build
EXPOSE 3000
ENV PORT 3000
CMD ["npx", "serve", "build", "-s", "-l", "3000", "--no-compression"]
