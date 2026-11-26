# API + worker image (same codebase, different command).
FROM node:22-alpine AS base
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @gym/api... build
RUN pnpm --filter @gym/api --prod deploy /out
# `pnpm deploy` copies @prisma/client but not the client generated for our schema; put it next to it.
RUN for d in /out/node_modules/.pnpm/@prisma+client@*/node_modules; do       cp -r /repo/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma "$d/"; done

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/packages/db/prisma ./packages/db/prisma
USER node
EXPOSE 4000
HEALTHCHECK CMD wget -qO- http://localhost:4000/health/live || exit 1
CMD ["node", "apps/api/dist/main.js"]
