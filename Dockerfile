# syntax=docker/dockerfile:1

# Node 22 LTS, not latest: the Qdrant client breaks on Node >= 26.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# src/lib/db/client.ts throws at module load when DATABASE_URL is unset, and
# `next build` loads route modules. Nothing connects during the build, so a
# syntactically valid placeholder is enough. The real value is injected at run
# time; this one never leaves the builder stage.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
RUN npm run build
# public/ is optional in this template — some scaffolded projects ship no
# static assets. Ensure it exists so the runner's COPY below always succeeds.
RUN mkdir -p public

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Run as a non-root user: a compromised app process should not be root in the
# container.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
# standalone bundles server.js plus only the traced node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
# 0.0.0.0, not localhost: the server must accept connections from outside the
# container.
ENV HOSTNAME=0.0.0.0
# Node 22 has fetch built in, so the healthcheck needs no curl in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
