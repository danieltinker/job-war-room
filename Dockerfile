# ── Base deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund && npx prisma generate

# ── Web build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ── Web runtime (Next.js standalone) ─────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]

# ── Worker runtime ───────────────────────────────────────────────────────
FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY worker ./worker
RUN mkdir -p /app/whatsapp-auth && chown -R app:app /app/whatsapp-auth
USER app
CMD ["npx", "tsx", "worker/index.ts"]

# ── Migrator (runs prisma migrate deploy then exits) ─────────────────────
FROM node:22-alpine AS migrate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]
