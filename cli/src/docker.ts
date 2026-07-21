// Replaces the template's Next.js Dockerfile when appKind === "api" (see
// scaffold.ts). No Next build/standalone-output stage and no Next non-root
// user: the standalone Hono server runs its TypeScript source directly via
// tsx (see transforms/config.ts's rewriteScriptsForApiOnly), so there is
// nothing to bundle. Otherwise mirrors the original Dockerfile's approach:
// multi-stage (deps cached separately from the runtime image), lockfile-
// agnostic install, a non-root runtime user, and the same GET /api/health
// healthcheck the full app uses.
export const API_ONLY_DOCKERFILE = `# syntax=docker/dockerfile:1

# Node 22 LTS, not latest: the Qdrant client breaks on Node >= 26.
FROM node:22-alpine AS deps
WORKDIR /app
# Every lockfile is globbed so it is optional: the CLI ships no lockfile (it is
# excluded from the template) and supports npm/pnpm/yarn/bun, so a generated
# project may carry any one of these — or none, when scaffolded with --no-install.
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* bun.lockb* bun.lock* .npmrc* ./
# No --omit=dev / --production: this image has no separate build stage — tsx and
# typescript (devDependencies) are required at container run time too, not just
# for local dev, because the server runs its TypeScript source directly (see the
# \`start\` script) instead of a tsc-compiled dist/.
RUN \\
  if [ -f package-lock.json ]; then npm ci; \\
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \\
  elif [ -f yarn.lock ]; then corepack enable && yarn --frozen-lockfile; \\
  elif [ -f bun.lockb ] || [ -f bun.lock ]; then npm i -g bun && bun install --frozen-lockfile; \\
  else npm install; \\
  fi

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Run as a non-root user: a compromised app process should not be root in the
# container.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 hono
COPY --from=deps --chown=hono:nodejs /app/node_modules ./node_modules
COPY --chown=hono:nodejs . .
USER hono
EXPOSE 3000
ENV PORT=3000
# @hono/node-server's serve() with no explicit hostname already binds every
# interface (unlike Next's standalone server, which needs HOSTNAME=0.0.0.0
# spelled out), so there is nothing to override here.
# Node 22 has fetch built in, so the healthcheck needs no curl in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \\
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"
CMD ["npm", "run", "start"]
`;
